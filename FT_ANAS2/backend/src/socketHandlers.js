const { query } = require('./db');

// Map: userId -> Set of socketIds
const onlineUsers = new Map();

/**
 * Broadcast updated online users list to all connected clients
 */
const broadcastOnlineUsers = (io) => {
  const list = Array.from(onlineUsers.keys());
  io.emit('online_users', list);
};

const registerSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    const { id: userId, username } = socket.user;
    console.log(`[Socket] ${username} (${userId}) connected — socket ${socket.id}`);

    // Track online presence
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    // Update DB status
    query('UPDATE users SET status = $1, last_seen = NOW() WHERE id = $2', ['online', userId]).catch(console.error);
    broadcastOnlineUsers(io);

    // ── JOIN ROOM ─────────────────────────────────────────────────────────────
    socket.on('join_room', async ({ roomId }) => {
      if (!roomId) return;

      try {
        // Ensure membership
        await query(
          'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [roomId, userId]
        );

        socket.join(roomId);

        // Notify room of new member
        io.to(roomId).emit('user_joined', { roomId, userId, username });
        console.log(`[Socket] ${username} joined room ${roomId}`);
      } catch (err) {
        socket.emit('error', { message: 'Failed to join room' });
        console.error('[Socket] join_room error:', err.message);
      }
    });

    // ── LEAVE ROOM ────────────────────────────────────────────────────────────
    socket.on('leave_room', ({ roomId }) => {
      socket.leave(roomId);
      io.to(roomId).emit('user_left', { roomId, userId, username });
    });

    // ── SEND ROOM MESSAGE ────────────────────────────────────────────────────
    socket.on('send_message', async ({ roomId, content }) => {
      if (!roomId || !content?.trim()) return;

      const sanitized = content.trim().slice(0, 2000);

      try {
        const result = await query(
          `INSERT INTO messages (room_id, user_id, content)
           VALUES ($1, $2, $3)
           RETURNING id, room_id, user_id, content, message_type, created_at`,
          [roomId, userId, sanitized]
        );

        const message = {
          ...result.rows[0],
          username,
          avatar_color: socket.user.avatar_color,
        };

        io.to(roomId).emit('new_message', message);
      } catch (err) {
        socket.emit('error', { message: 'Failed to send message' });
        console.error('[Socket] send_message error:', err.message);
      }
    });

    // ── TYPING INDICATOR ─────────────────────────────────────────────────────
    socket.on('typing_start', ({ roomId }) => {
      socket.to(roomId).emit('user_typing', { userId, username, roomId });
    });

    socket.on('typing_stop', ({ roomId }) => {
      socket.to(roomId).emit('user_stop_typing', { userId, username, roomId });
    });

    // ── DIRECT MESSAGE ───────────────────────────────────────────────────────
    socket.on('send_dm', async ({ receiverId, content }) => {
      if (!receiverId || !content?.trim()) return;

      const sanitized = content.trim().slice(0, 2000);

      try {
        const result = await query(
          `INSERT INTO direct_messages (sender_id, receiver_id, content)
           VALUES ($1, $2, $3)
           RETURNING id, sender_id, receiver_id, content, created_at`,
          [userId, receiverId, sanitized]
        );

        const dm = {
          ...result.rows[0],
          sender_username: username,
          sender_avatar_color: socket.user.avatar_color,
        };

        // Send to all sockets of receiver
        const receiverSockets = onlineUsers.get(receiverId);
        if (receiverSockets) {
          receiverSockets.forEach((sid) => io.to(sid).emit('new_dm', dm));
        }

        // Echo back to sender
        socket.emit('new_dm', dm);
      } catch (err) {
        socket.emit('error', { message: 'Failed to send DM' });
        console.error('[Socket] send_dm error:', err.message);
      }
    });

    // ── DM TYPING ────────────────────────────────────────────────────────────
    socket.on('dm_typing_start', ({ receiverId }) => {
      const receiverSockets = onlineUsers.get(receiverId);
      if (receiverSockets) {
        receiverSockets.forEach((sid) =>
          io.to(sid).emit('dm_user_typing', { userId, username })
        );
      }
    });

    socket.on('dm_typing_stop', ({ receiverId }) => {
      const receiverSockets = onlineUsers.get(receiverId);
      if (receiverSockets) {
        receiverSockets.forEach((sid) =>
          io.to(sid).emit('dm_user_stop_typing', { userId, username })
        );
      }
    });

    // ── EDIT MESSAGE ─────────────────────────────────────────────────────────
    socket.on('edit_message', async ({ messageId, content, roomId }) => {
      if (!messageId || !content?.trim()) return;

      try {
        const result = await query(
          `UPDATE messages SET content = $1, edited = TRUE, edited_at = NOW()
           WHERE id = $2 AND user_id = $3
           RETURNING *`,
          [content.trim().slice(0, 2000), messageId, userId]
        );

        if (result.rows[0]) {
          io.to(roomId).emit('message_edited', result.rows[0]);
        }
      } catch (err) {
        console.error('[Socket] edit_message error:', err.message);
      }
    });

    // ── DELETE MESSAGE ───────────────────────────────────────────────────────
    socket.on('delete_message', async ({ messageId, roomId }) => {
      try {
        const result = await query(
          'DELETE FROM messages WHERE id = $1 AND user_id = $2 RETURNING id',
          [messageId, userId]
        );

        if (result.rows[0]) {
          io.to(roomId).emit('message_deleted', { messageId, roomId });
        }
      } catch (err) {
        console.error('[Socket] delete_message error:', err.message);
      }
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          await query('UPDATE users SET status = $1, last_seen = NOW() WHERE id = $2', ['offline', userId]).catch(
            console.error
          );
        }
      }

      broadcastOnlineUsers(io);
      console.log(`[Socket] ${username} disconnected`);
    });
  });
};

module.exports = { registerSocketHandlers };

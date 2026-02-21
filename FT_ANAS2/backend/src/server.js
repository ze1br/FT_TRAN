require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { query } = require('./db');
const { verifyToken } = require('./auth');
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const dmRoutes = require('./routes/dmRoutes');
const friendRoutes = require('./routes/friendRoutes');

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const app = express();
const httpServer = http.createServer(app);

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/friends', friendRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.use((_, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error' }));

const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'], credentials: true },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) { socket.user = null; return next(); }
  try { socket.user = verifyToken(token); next(); }
  catch { socket.user = null; next(); }
});

io.on('connection', (socket) => {
  console.log('[Socket] Connected:', socket.id, '| user:', socket.user?.username || 'anonymous');

  socket.on('join room', async (roomId) => {
    if (!roomId) return;
    socket.join(roomId);
    try {
      const result = await query(
        `SELECT m.id, m.room_id, m.user_id, m.content, m.created_at,
                u.username, u.avatar_color
         FROM messages m LEFT JOIN users u ON u.id = m.user_id
         WHERE m.room_id = $1 ORDER BY m.created_at ASC LIMIT 50`,
        [roomId]
      );
      socket.emit('chat history', result.rows);
    } catch (e) {
      console.error('[Socket] History fetch error:', e.message);
      socket.emit('chat history', []);
    }
  });

  socket.on('chat message', async (msg) => {
    const { room_id, content } = msg;
    if (!room_id || !content?.trim()) return;
    const userId = socket.user?.id || null;
    try {
      const result = await query(
        `INSERT INTO messages (room_id, user_id, content)
         VALUES ($1, $2, $3) RETURNING id, room_id, user_id, content, created_at`,
        [room_id, userId, content.trim()]
      );
      let username = 'anonymous', avatarColor = '#4A90D9';
      if (userId) {
        const u = await query('SELECT username, avatar_color FROM users WHERE id = $1', [userId]);
        if (u.rows[0]) { username = u.rows[0].username; avatarColor = u.rows[0].avatar_color; }
      }
      io.to(room_id).emit('chat message', { ...result.rows[0], username, avatar_color: avatarColor });
    } catch (e) { console.error('[Socket] Message save error:', e.message); }
  });

  socket.on('send dm', async ({ receiverId, content }) => {
    console.log('[send dm] from:', socket.user?.username, '→ to:', receiverId);
    
    if (!receiverId || !content?.trim() || !socket.user) {
      console.log('[send dm] blocked — missing data or no auth', { receiverId, hasUser: !!socket.user });
      return;
    }
  
    const senderId = socket.user.id;

    try {
      const result = await query(
        `INSERT INTO direct_messages (sender_id, receiver_id, content)
         VALUES ($1, $2, $3) RETURNING *`,
        [senderId, receiverId, content.trim()]
      );

const senderInfo = await query('SELECT username, avatar_color FROM users WHERE id = $1', [senderId]);
const dm = {
  ...result.rows[0],
  sender_username: senderInfo.rows[0]?.username,
  sender_avatar_color: senderInfo.rows[0]?.avatar_color || '#4A90D9',
};

      const allSockets = [...io.sockets.sockets.values()];

      // Send to ALL receiver's sockets (multiple tabs)
      const receiverSockets = allSockets.filter(s => s.user?.id === receiverId);
      receiverSockets.forEach(s => s.emit('new dm', dm));

      // Echo to ALL sender's sockets (multiple tabs)
      const senderSockets = allSockets.filter(s => s.user?.id === senderId);
      senderSockets.forEach(s => s.emit('new dm', dm));

    } catch (e) {
      console.error('[Socket] DM error:', e.message);
    }
  });
  //   try {
  //     const result = await query(
  //       `INSERT INTO direct_messages (sender_id, receiver_id, content)
  //        VALUES ($1, $2, $3) RETURNING *`,
  //       [senderId, receiverId, content.trim()]
  //     );
  
  //     const dm = { ...result.rows[0], sender_username: socket.user.username };
  
  //     // Debug: list all connected sockets and their users
  //     const allSockets = [...io.sockets.sockets.values()];
  //     console.log('[send dm] connected sockets:', allSockets.map(s => ({ id: s.id, user: s.user?.username || 'anon' })));
  
  //     const receiverSocket = allSockets.find(s => s.user?.id === receiverId);
  //     console.log('[send dm] receiver socket found:', !!receiverSocket);
  
  //     if (receiverSocket) receiverSocket.emit('new dm', dm);
  //     socket.emit('new dm', dm);
  //   } catch (e) {
  //     console.error('[Socket] DM error:', e.message);
  //   }
  // });
  // socket.on('send dm', async ({ receiverId, content }) => {
  //   if (!receiverId || !content?.trim() || !socket.user) return;
  //   const senderId = socket.user.id;
  //   try {
  //     const result = await query(
  //       `INSERT INTO direct_messages (sender_id, receiver_id, content)
  //        VALUES ($1, $2, $3) RETURNING *`,
  //       [senderId, receiverId, content.trim()]
  //     );
  //     const dm = { ...result.rows[0], sender_username: socket.user.username };
  //     const receiverSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === receiverId);
  //     if (receiverSocket) receiverSocket.emit('new dm', dm);
  //     socket.emit('new dm', dm);
  //   } catch (e) { console.error('[Socket] DM error:', e.message); }
  // });

  socket.on('friend request', ({ receiverId }) => {
    const receiverSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === receiverId);
    if (receiverSocket) receiverSocket.emit('new friend request', { from: socket.user });
  });

  socket.on('disconnect', () => console.log('[Socket] Disconnected:', socket.id));
});

httpServer.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`   HTTP → http://localhost:${PORT}`);
  console.log(`   CORS → ${CLIENT_ORIGIN}\n`);
});

// require('dotenv').config();
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');

// const { query } = require('./db');
// const { verifyToken } = require('./auth');
// const authRoutes = require('./routes/authRoutes');
// const roomRoutes = require('./routes/roomRoutes');
// const dmRoutes = require('./routes/dmRoutes');

// const PORT = process.env.PORT || 3001;
// const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// const app = express();
// const httpServer = http.createServer(app);
// const friendRoutes = require('./routes/friendRoutes');

// app.use('/api/friends', friendRoutes);
// app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// app.use(express.json({ limit: '1mb' }));

// app.use('/api/auth', authRoutes);
// app.use('/api/rooms', roomRoutes);
// app.use('/api/dm', dmRoutes);

// app.get('/health', (_, res) => res.json({ status: 'ok' }));
// app.use((_, res) => res.status(404).json({ error: 'Not found' }));
// app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error' }));

// const io = new Server(httpServer, {
//   cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'], credentials: true },
// });

// io.use((socket, next) => {
//   const token = socket.handshake.auth?.token;
//   if (!token) { socket.user = null; return next(); }
//   try {
//     socket.user = verifyToken(token);
//     next();
//   } catch {
//     socket.user = null;
//     next();
//   }
// });

// io.on('connection', (socket) => {
//   console.log('[Socket] Connected:', socket.id, '| user:', socket.user?.username || 'anonymous');

//   socket.on('join room', async (roomId) => {
//     if (!roomId) return;
//     socket.join(roomId);
//     console.log(`[Socket] ${socket.id} joined room: ${roomId}`);
//     try {
//       const result = await query(
//         `SELECT m.id, m.room_id, m.user_id, m.content, m.created_at,
//                 u.username, u.avatar_color
//          FROM messages m
//          LEFT JOIN users u ON u.id = m.user_id
//          WHERE m.room_id = $1
//          ORDER BY m.created_at ASC LIMIT 50`,
//         [roomId]
//       );
//       socket.emit('chat history', result.rows);
//     } catch (e) {
//       console.error('[Socket] History fetch error:', e.message);
//       socket.emit('chat history', []);
//     }
//   });

//   socket.on('chat message', async (msg) => {
//     const { room_id, content } = msg;
//     if (!room_id || !content?.trim()) return;

//     const userId = socket.user?.id || null;

//     try {
//       const result = await query(
//         `INSERT INTO messages (room_id, user_id, content)
//          VALUES ($1, $2, $3)
//          RETURNING id, room_id, user_id, content, created_at`,
//         [room_id, userId, content.trim()]
//       );

//       let username = 'anonymous';
//       let avatarColor = '#4A90D9';

//       if (userId) {
//         const u = await query('SELECT username, avatar_color FROM users WHERE id = $1', [userId]);
//         if (u.rows[0]) {
//           username = u.rows[0].username;
//           avatarColor = u.rows[0].avatar_color;
//         }
//       }

//       io.to(room_id).emit('chat message', {
//         ...result.rows[0],
//         username,
//         avatar_color: avatarColor,
//       });
//     } catch (e) {
//       console.error('[Socket] Message save error:', e.message);
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('[Socket] Disconnected:', socket.id);
//   });
//   // Send DM
// socket.on('send dm', async ({ receiverId, content }) => {
//   if (!receiverId || !content?.trim() || !socket.user) return;

//   const senderId = socket.user.id;

//   try {
//     const result = await query(
//       `INSERT INTO direct_messages (sender_id, receiver_id, content)
//        VALUES ($1, $2, $3)
//        RETURNING *`,
//       [senderId, receiverId, content.trim()]
//     );

//     const dm = {
//       ...result.rows[0],
//       sender_username: socket.user.username,
//     };

//     // Send to receiver if online
//     const receiverSocket = [...io.sockets.sockets.values()]
//       .find(s => s.user?.id === receiverId);
//     if (receiverSocket) receiverSocket.emit('new dm', dm);

//     // Echo back to sender
//     socket.emit('new dm', dm);
//   } catch (e) {
//     console.error('[Socket] DM error:', e.message);
//   }
// });
// }); // ← closing io.on('connection')

// httpServer.listen(PORT, () => {
//   console.log(`\n🚀 MultiChat server running on port ${PORT}`);
//   console.log(`   HTTP → http://localhost:${PORT}`);
//   console.log(`   WS   → ws://localhost:${PORT}`);
//   console.log(`   CORS → ${CLIENT_ORIGIN}\n`);
// });



// require('dotenv').config();
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');

// const { query } = require('./db');
// const authRoutes = require('./routes/authRoutes');
// const roomRoutes = require('./routes/roomRoutes');
// const dmRoutes = require('./routes/dmRoutes');

// const PORT = process.env.PORT || 3001;
// const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// const app = express();
// const httpServer = http.createServer(app);

// app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// app.use(express.json({ limit: '1mb' }));

// app.use('/api/auth', authRoutes);
// app.use('/api/rooms', roomRoutes);
// app.use('/api/dm', dmRoutes);

// app.get('/health', (_, res) => res.json({ status: 'ok' }));
// app.use((_, res) => res.status(404).json({ error: 'Not found' }));
// app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error' }));

// const io = new Server(httpServer, {
//   cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'], credentials: true },
// });

// io.on('connection', (socket) => {
//   console.log('[Socket] Connected:', socket.id);

//   socket.on('join room', async (roomId) => {
//     if (!roomId) return;
//     socket.join(roomId);
//     console.log(`[Socket] ${socket.id} joined room: ${roomId}`);
//     try {
//       const result = await query(
//         `SELECT m.id, m.room_id, m.user_id, m.content, m.created_at,
//                 u.username, u.avatar_color
//          FROM messages m
//          LEFT JOIN users u ON u.id = m.user_id
//          WHERE m.room_id = $1
//          ORDER BY m.created_at ASC LIMIT 50`,
//         [roomId]
//       );
//       socket.emit('chat history', result.rows);
//     } catch (e) {
//       console.error('[Socket] History fetch error:', e.message);
//       socket.emit('chat history', []);
//     }
//   });

//   socket.on('chat message', async (msg) => {
//     const { room_id, content } = msg;
//     console.log('[Message received]', msg);
//     if (!room_id || !content?.trim()) return;
//     try {
//       const result = await query(
//         `INSERT INTO messages (room_id, content)
//          VALUES ($1, $2)
//          RETURNING id, room_id, user_id, content, created_at`,
//         [room_id, content.trim()]
//       );
//       io.to(room_id).emit('chat message', {
//         ...result.rows[0],
//         username: 'anonymous',
//         avatar_color: '#4A90D9',
//       });
//     } catch (e) {
//       console.error('[Socket] Message save error:', e.message);
//       socket.emit('error', { message: 'Failed to send message' });
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('[Socket] Disconnected:', socket.id);
//   });
// }); // ← this closing brace was missing

// httpServer.listen(PORT, () => {
//   console.log(`\n🚀 MultiChat server running on port ${PORT}`);
//   console.log(`   HTTP → http://localhost:${PORT}`);
//   console.log(`   WS   → ws://localhost:${PORT}`);
//   console.log(`   CORS → ${CLIENT_ORIGIN}\n`);
// });



// ============================================================================================
// // //workkkkkkkkkkkkkkkkkkk
// require('dotenv').config();
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');

// const { query } = require('./db');
// const authRoutes = require('./routes/authRoutes');
// const roomRoutes = require('./routes/roomRoutes');
// const dmRoutes = require('./routes/dmRoutes');

// const PORT = process.env.PORT || 3001;
// const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// const app = express();
// const httpServer = http.createServer(app);

// app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// app.use(express.json({ limit: '1mb' }));

// app.use('/api/auth', authRoutes);
// app.use('/api/rooms', roomRoutes);
// app.use('/api/dm', dmRoutes);

// app.get('/health', (_, res) => res.json({ status: 'ok' }));
// app.use((_, res) => res.status(404).json({ error: 'Not found' }));
// app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error' }));

// const io = new Server(httpServer, {
//   cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'], credentials: true },
// });

// io.on('connection', (socket) => {
//   console.log('[Socket] Connected:', socket.id);

//   socket.on('join room', async (roomId) => {
//     if (!roomId) return;
//     socket.join(roomId);
//     console.log(`[Socket] ${socket.id} joined room: ${roomId}`);
//     try {
//       const result = await query(
//         `SELECT m.id, m.room_id, m.user_id, m.content, m.created_at,
//                 u.username, u.avatar_color
//          FROM messages m
//          LEFT JOIN users u ON u.id = m.user_id
//          WHERE m.room_id = $1
//          ORDER BY m.created_at ASC LIMIT 50`,
//         [roomId]
//       );
//       socket.emit('chat history', result.rows);
//     } catch (e) {
//       console.error('[Socket] History fetch error:', e.message);
//       socket.emit('chat history', []);
//     }
//   });

//   socket.on('chat message', async (msg) => {
//     const { room_id, content } = msg;
//     console.log('[Message received]', msg);
//     if (!room_id || !content?.trim()) return;
//     try {
//       const result = await query(
//         `INSERT INTO messages (room_id, content)
//          VALUES ($1, $2)
//          RETURNING id, room_id, user_id, content, created_at`,
//         [room_id, content.trim()]
//       );
//       io.to(room_id).emit('chat message', {
//         ...result.rows[0],
//         username: 'anonymous',
//         avatar_color: '#4A90D9',
//       });
//     } catch (e) {
//       console.error('[Socket] Message save error:', e.message);
//       socket.emit('error', { message: 'Failed to send message' });
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('[Socket] Disconnected:', socket.id);
//   });
// }); // ← this closing brace was missing

// httpServer.listen(PORT, () => {
//   console.log(`\n🚀 MultiChat server running on port ${PORT}`);
//   console.log(`   HTTP → http://localhost:${PORT}`);
//   console.log(`   WS   → ws://localhost:${PORT}`);
//   console.log(`   CORS → ${CLIENT_ORIGIN}\n`);
// });



















// ============================================================================================
// require('dotenv').config();
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');

// const { query } = require('./db');
// const authRoutes = require('./routes/authRoutes');
// const roomRoutes = require('./routes/roomRoutes');
// const dmRoutes = require('./routes/dmRoutes');

// const PORT = process.env.PORT || 3001;
// const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// const app = express();
// const httpServer = http.createServer(app);

// // ── Middleware ───────────────────────────────────────────────────────────────
// app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// app.use(express.json({ limit: '1mb' }));

// // ── REST Routes ──────────────────────────────────────────────────────────────
// app.use('/api/auth', authRoutes);
// app.use('/api/rooms', roomRoutes);
// app.use('/api/dm', dmRoutes);

// app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
// app.use((_, res) => res.status(404).json({ error: 'Not found' }));
// app.use((err, _req, res, _next) => {
//   console.error('[Express] Unhandled error:', err);
//   res.status(500).json({ error: 'Internal server error' });
// });

// // ── Socket.io ────────────────────────────────────────────────────────────────
// const io = new Server(httpServer, {
//   cors: {
//     origin: CLIENT_ORIGIN,
//     methods: ['GET', 'POST'],
//     credentials: true,
//   },
// });

// io.on('connection', (socket) => {
//   console.log('[Socket] Connected:', socket.id);

//   // Join a room + send history to this socket only
//   socket.on('join room', async (roomId) => {
//     if (!roomId) return;
//     socket.join(roomId);
//     console.log(`[Socket] ${socket.id} joined room: ${roomId}`);

//     try {
//       const result = await query(
//         `SELECT m.id, m.room_id, m.user_id, m.content, m.created_at,
//                 u.username, u.avatar_color
//          FROM messages m
//          LEFT JOIN users u ON u.id = m.user_id
//          WHERE m.room_id = $1
//          ORDER BY m.created_at ASC
//          LIMIT 50`,
//         [roomId]
//       );
//       socket.emit('chat history', result.rows);
//     } catch (e) {
//       console.error('[Socket] History fetch error:', e.message);
//       socket.emit('chat history', []);
//     }
//   });

//   // Receive message → save to DB → broadcast to entire room
//   socket.on('chat message', async (msg) => {
//     const { room_id, user_id, content } = msg;
//     if (!room_id || !user_id || !content?.trim()) return;

//     try {
//       const result = await query(
//         `INSERT INTO messages (room_id, user_id, content)
//          VALUES ($1, $2, $3)
//          RETURNING id, room_id, user_id, content, created_at`,
//         [room_id, user_id, content.trim()]
//       );

//       // Attach username for display
//       const userResult = await query(
//         'SELECT username, avatar_color FROM users WHERE id = $1',
//         [user_id]
//       );

//       const fullMessage = {
//         ...result.rows[0],
//         username: userResult.rows[0]?.username || 'unknown',
//         avatar_color: userResult.rows[0]?.avatar_color || '#4A90D9',
//       };

//       // Broadcast to ALL clients in the room (including sender)
//       io.to(room_id).emit('chat message', fullMessage);
//     } catch (e) {
//       console.error('[Socket] Message save error:', e.message);
//       socket.emit('error', { message: 'Failed to send message' });
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('[Socket] Disconnected:', socket.id);
//   });
// });

// // ── Start ────────────────────────────────────────────────────────────────────
// httpServer.listen(PORT, () => {
//   console.log(`\n🚀 MultiChat server running on port ${PORT}`);
//   console.log(`   HTTP → http://localhost:${PORT}`);
//   console.log(`   WS   → ws://localhost:${PORT}`);
//   console.log(`   CORS → ${CLIENT_ORIGIN}\n`);
// });


// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');

// const authRoutes = require('./routes/authRoutes');
// const roomRoutes = require('./routes/roomRoutes');
// const dmRoutes = require('./routes/dmRoutes');

// const PORT = process.env.PORT || 3001;
// const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// const app = express(); // <-- declare app first
// const httpServer = http.createServer(app);

// // Middleware
// app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// app.use(express.json({ limit: '1mb' }));

// // Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/rooms', roomRoutes);
// app.use('/api/dm', dmRoutes);

// // Health check
// app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// // 404 fallback
// app.use((_, res) => res.status(404).json({ error: 'Not found' }));

// // Global error handler
// app.use((err, _req, res, _next) => {
//   console.error('[Express] Unhandled error:', err);
//   res.status(500).json({ error: 'Internal server error' });
// });

// // Socket.io
// const io = new Server(httpServer, {
//   cors: {
//     origin: CLIENT_ORIGIN,
//     methods: ['GET', 'POST'],
//     credentials: true,
//   },
// });

// io.on('connection', (socket) => {
//   console.log('User connected:', socket.id);
//   socket.on('chat message', (msg) => io.emit('chat message', msg));
//   socket.on('disconnect', () => console.log('User disconnected:', socket.id));
// });

// // Start server
// httpServer.listen(PORT, () => {
//   console.log(`🚀 MultiChat server running on port ${PORT}`);
//   console.log(`HTTP → http://localhost:${PORT}`);
//   console.log(`WS   → ws://localhost:${PORT}`);
//   console.log(`CORS → ${CLIENT_ORIGIN}`);
// });

// require('dotenv').config();
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');
// const { socketAuthMiddleware } = require('./auth');
// const { registerSocketHandlers } = require('./socketHandlers');

// const PORT = process.env.PORT || 3001;
// const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// const app = express();
// const httpServer = http.createServer(app);

// const io = new Server(httpServer, {
//   cors: {
//     origin: CLIENT_ORIGIN,
//     methods: ['GET', 'POST'],
//   },
//   pingTimeout: 60000,
//   pingInterval: 25000,
// });

// // Optional if you have auth middleware
// io.use(socketAuthMiddleware);
// registerSocketHandlers(io);

// app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// app.use(express.json({ limit: '1mb' }));

// app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// httpServer.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });
 



// no data base
// require('dotenv').config();
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');

// const { query } = require('./db');

// const PORT = 3001;
// const CLIENT_ORIGIN = 'http://localhost:5173';

// const app = express();
// const httpServer = http.createServer(app);

// // ── Socket.io setup ─────────────────────────────────────────────────────────
// const io = new Server(httpServer, {
//   cors: {
//     origin: CLIENT_ORIGIN,
//     methods: ['GET', 'POST'],
//   },
//   pingTimeout: 60000,
//   pingInterval: 25000,
// });

// // ── Socket event handlers ────────────────────────────────────────────────────
// io.on('connection', async (socket) => {
//   console.log('User connected:', socket.id);

//   // Send last 50 messages on connect
//   try {
//     const result = await query(
//       `SELECT m.id, m.content, m.created_at, u.username 
//        FROM messages m 
//        LEFT JOIN users u ON m.user_id = u.id
//        ORDER BY m.created_at ASC
//        LIMIT 50`
//     );
//     socket.emit('chat history', result.rows);
//   } catch (err) {
//     console.error('Error fetching messages:', err);
//   }

//   // Listen for new chat messages
//   socket.on('chat message', async (msg) => {
//     console.log('Received message:', msg);

//     try {
//       const insert = await query(
//         `INSERT INTO messages (room_id, user_id, content)
//          VALUES ($1, $2, $3)
//          RETURNING id, content, created_at`,
//         [msg.room_id || null, msg.user_id || null, msg.content]
//       );
//       const savedMsg = insert.rows[0];
//       savedMsg.username = msg.username || 'Anonymous';

//       io.emit('chat message', savedMsg);
//     } catch (err) {
//       console.error('Error saving message:', err);
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('User disconnected:', socket.id);
//   });
// });

// // ── Express middleware ───────────────────────────────────────────────────────
// app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// app.use(express.json({ limit: '1mb' }));

// // Health check
// app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// // 404 fallback
// app.use((_, res) => res.status(404).json({ error: 'Not found' }));

// // Global error handler
// app.use((err, _req, res, _next) => {
//   console.error('[Express] Unhandled error:', err);
//   res.status(500).json({ error: 'Internal server error' });
// });

// // ── Start server ─────────────────────────────────────────────────────────────
// httpServer.listen(PORT, () => {
//   console.log(`\n🚀 MultiChat server running on port ${PORT}`);
//   console.log(`   HTTP  → http://localhost:${PORT}`);
//   console.log(`   WS    → ws://localhost:${PORT}`);
//   console.log(`   CORS  → ${CLIENT_ORIGIN}\n`);
// });

// // Graceful shutdown
// process.on('SIGTERM', () => {
//   console.log('[Server] SIGTERM received, shutting down gracefully...');
//   httpServer.close(() => process.exit(0));
// });

// // server.js // work fine 
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');

// const PORT = 3001;
// const CLIENT_ORIGIN = 'http://localhost:5173';

// const app = express();
// const httpServer = http.createServer(app);

// // ── Socket.io setup ─────────────────────────────────────────────────────────
// const io = new Server(httpServer, {
//   cors: {
//     origin: CLIENT_ORIGIN,
//     methods: ['GET', 'POST'],
//   },
//   pingTimeout: 60000,
//   pingInterval: 25000,
// });

// // ── Socket event handlers ────────────────────────────────────────────────────
// io.on('connection', (socket) => {
//   console.log('User connected:', socket.id);

//   // Listen for chat messages from clients
//   socket.on('chat message', (msg) => {
//     console.log('Received message:', msg);
//     // Broadcast the message to all connected clients
//     io.emit('chat message', msg);
//   });

//   socket.on('disconnect', () => {
//     console.log('User disconnected:', socket.id);
//   });
// });

// // ── Express middleware ───────────────────────────────────────────────────────
// app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// app.use(express.json({ limit: '1mb' }));

// // Health check route
// app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// // 404 fallback
// app.use((_, res) => res.status(404).json({ error: 'Not found' }));

// // Global error handler
// app.use((err, _req, res, _next) => {
//   console.error('[Express] Unhandled error:', err);
//   res.status(500).json({ error: 'Internal server error' });
// });

// // ── Start server ─────────────────────────────────────────────────────────────
// httpServer.listen(PORT, () => {
//   console.log(`\n🚀 MultiChat server running on port ${PORT}`);
//   console.log(`   HTTP  → http://localhost:${PORT}`);
//   console.log(`   WS    → ws://localhost:${PORT}`);
//   console.log(`   CORS  → ${CLIENT_ORIGIN}\n`);
// });

// // Graceful shutdown
// process.on('SIGTERM', () => {
//   console.log('[Server] SIGTERM received, shutting down gracefully...');
//   httpServer.close(() => process.exit(0));
// });

// ------------------------- > work well 
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');

// const PORT = 3001;
// const CLIENT_ORIGIN = 'http://localhost:5173';

// const app = express();
// const httpServer = http.createServer(app);

// // Socket.io setup
// const io = new Server(httpServer, {
//   cors: {
//     origin: CLIENT_ORIGIN,
//     methods: ['GET', 'POST'],
//   },
// });

// io.on('connection', (socket) => {
//   console.log('User connected:', socket.id);

//   socket.on('chat message', (msg) => {
//     console.log('Received message:', msg);
//     io.emit('chat message', msg); // broadcast to all clients
//   });

//   socket.on('disconnect', () => {
//     console.log('User disconnected:', socket.id);
//   });
// });

// // Health check
// app.get('/health', (_, res) => res.json({ status: 'ok' }));

// httpServer.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });





/*******************************/ //  not  work need fix 
// require('dotenv').config();
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');

// const { socketAuthMiddleware } = require('./auth');
// const { registerSocketHandlers } = require('./socketHandlers');
// const authRoutes = require('./routes/authRoutes');
// const roomRoutes = require('./routes/roomRoutes');
// const dmRoutes = require('./routes/dmRoutes');

// const PORT = process.env.PORT || 3001;
// const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// const app = express();
// const httpServer = http.createServer(app);

// // ── Socket.io setup ─────────────────────────────────────────────────────────
// const io = new Server(httpServer, {
//   cors: {
//     origin: CLIENT_ORIGIN,
//     methods: ['GET', 'POST'],
//     credentials: true,
//   },
//   pingTimeout: 60000,
//   pingInterval: 25000,
// });

// io.use(socketAuthMiddleware);
// registerSocketHandlers(io);

// // ── Express middleware ───────────────────────────────────────────────────────
// app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// app.use(express.json({ limit: '1mb' }));

// // ── Routes ───────────────────────────────────────────────────────────────────
// app.use('/api/auth', authRoutes);
// app.use('/api/rooms', roomRoutes);
// app.use('/api/dm', dmRoutes);

// // Health check
// app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// // 404 fallback
// app.use((_, res) => res.status(404).json({ error: 'Not found' }));

// // Global error handler
// app.use((err, _req, res, _next) => {
//   console.error('[Express] Unhandled error:', err);
//   res.status(500).json({ error: 'Internal server error' });
// });

// // ── Start ────────────────────────────────────────────────────────────────────
// httpServer.listen(PORT, () => {
//   console.log(`\n🚀 MultiChat server running on port ${PORT}`);
//   console.log(`   HTTP  → http://localhost:${PORT}`);
//   console.log(`   WS    → ws://localhost:${PORT}`);
//   console.log(`   CORS  → ${CLIENT_ORIGIN}\n`);
// });

// // Graceful shutdown
// process.on('SIGTERM', () => {
//   console.log('[Server] SIGTERM received, shutting down gracefully...');
//   httpServer.close(() => process.exit(0));
// });

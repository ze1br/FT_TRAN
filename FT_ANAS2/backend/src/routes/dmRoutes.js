const express = require('express');
const { query } = require('../db');
const { authMiddleware } = require('../auth');
const router = express.Router();

// GET /api/dm/unread — MUST be before /:userId
router.get('/unread', authMiddleware, async (req, res) => {
  try {
    const r = await query(
      `SELECT sender_id, COUNT(*)::int AS count
       FROM direct_messages
       WHERE receiver_id = $1 AND read = FALSE
       GROUP BY sender_id`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dm/:userId — MUST be after /unread
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const r = await query(
      `SELECT dm.*, s.username AS sender_username, s.avatar_color AS sender_avatar_color
       FROM direct_messages dm JOIN users s ON s.id = dm.sender_id
       WHERE (dm.sender_id=$1 AND dm.receiver_id=$2) OR (dm.sender_id=$2 AND dm.receiver_id=$1)
       ORDER BY dm.created_at DESC LIMIT 50`,
      [req.user.id, req.params.userId]
    );

    // Mark as read
    await query(
      `UPDATE direct_messages SET read = TRUE
       WHERE sender_id = $1 AND receiver_id = $2 AND read = FALSE`,
      [req.params.userId, req.user.id]
    );

    res.json(r.rows.reverse());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

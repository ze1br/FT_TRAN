const express = require('express');
const { query } = require('../db');
const { authMiddleware } = require('../auth');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const r = await query(
    `SELECT u.id, u.username, u.avatar_color, u.status, f.status AS friendship_status
     FROM friendships f
     JOIN users u ON u.id = CASE
       WHEN f.requester_id = $1 THEN f.receiver_id
       ELSE f.requester_id
     END
     WHERE (f.requester_id = $1 OR f.receiver_id = $1)
       AND f.status = 'accepted'`,
    [req.user.id]
  );
  res.json(r.rows);
});

router.get('/pending', authMiddleware, async (req, res) => {
  const r = await query(
    `SELECT f.id, u.id AS user_id, u.username, u.avatar_color
     FROM friendships f
     JOIN users u ON u.id = f.requester_id
     WHERE f.receiver_id = $1 AND f.status = 'pending'`,
    [req.user.id]
  );
  res.json(r.rows);
});

router.post('/request/:userId', authMiddleware, async (req, res) => {
  try {
    await query(
      `INSERT INTO friendships (requester_id, receiver_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.user.id, req.params.userId]
    );
    res.json({ sent: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/accept/:userId', authMiddleware, async (req, res) => {
  await query(
    `UPDATE friendships SET status = 'accepted'
     WHERE requester_id = $1 AND receiver_id = $2`,
    [req.params.userId, req.user.id]
  );
  res.json({ accepted: true });
});

router.delete('/:userId', authMiddleware, async (req, res) => {
  await query(
    `DELETE FROM friendships
     WHERE (requester_id = $1 AND receiver_id = $2)
        OR (requester_id = $2 AND receiver_id = $1)`,
    [req.user.id, req.params.userId]
  );
  res.json({ removed: true });
});

module.exports = router;

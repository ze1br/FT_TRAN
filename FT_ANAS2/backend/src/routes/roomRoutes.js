const express = require('express');
const { query } = require('../db');
const { authMiddleware } = require('../auth');
const router = express.Router();

router.get('/public', async (req, res) => {
  try {
    const r = await query('SELECT id, name FROM rooms WHERE is_private = FALSE ORDER BY created_at ASC');
    console.log('[Public rooms] rows:', r.rows);
    res.json(r.rows);
  } catch(e) {
    console.error('[Public rooms error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  const r = await query(
    `SELECT r.*,COUNT(rm.user_id)::int AS member_count FROM rooms r
     LEFT JOIN room_members rm ON rm.room_id=r.id
     WHERE r.is_private=FALSE GROUP BY r.id ORDER BY r.created_at ASC`
  );
  res.json(r.rows);
});

router.post('/', authMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = await query(
      'INSERT INTO rooms (name,description,owner_id) VALUES ($1,$2,$3) RETURNING *',
      [name.trim().toLowerCase(), description||null, req.user.id]
    );
    await query('INSERT INTO room_members (room_id,user_id,role) VALUES ($1,$2,$3)', [r.rows[0].id, req.user.id, 'owner']);
    res.status(201).json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/join', authMiddleware, async (req, res) => {
  await query('INSERT INTO room_members (room_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
  res.json({ joined: true });
});

router.get('/:id/messages', authMiddleware, async (req, res) => {
  const r = await query(
    `SELECT m.*,u.username,u.avatar_color FROM messages m
     LEFT JOIN users u ON u.id=m.user_id
     WHERE m.room_id=$1 ORDER BY m.created_at DESC LIMIT 50`,
    [req.params.id]
  );
  res.json(r.rows.reverse());
});

router.get('/:id/members', authMiddleware, async (req, res) => {
  const r = await query(
    `SELECT u.id,u.username,u.avatar_color,u.status,rm.role FROM room_members rm
     JOIN users u ON u.id=rm.user_id WHERE rm.room_id=$1`,
    [req.params.id]
  );
  res.json(r.rows);
});

module.exports = router;
// const express = require('express');
// const { query } = require('../db');
// const { authMiddleware } = require('../auth');
// const router = express.Router();

// router.get('/', authMiddleware, async (req, res) => {
//   const r = await query(
//     `SELECT r.*,COUNT(rm.user_id)::int AS member_count FROM rooms r
//      LEFT JOIN room_members rm ON rm.room_id=r.id
//      WHERE r.is_private=FALSE GROUP BY r.id ORDER BY r.created_at ASC`
//   );
//   res.json(r.rows);
// });

// router.post('/', authMiddleware, async (req, res) => {
//   const { name, description } = req.body;
//   if (!name) return res.status(400).json({ error: 'Name required' });
//   try {
//     const r = await query(
//       'INSERT INTO rooms (name,description,owner_id) VALUES ($1,$2,$3) RETURNING *',
//       [name.trim().toLowerCase(), description||null, req.user.id]
//     );
//     await query('INSERT INTO room_members (room_id,user_id,role) VALUES ($1,$2,$3)', [r.rows[0].id, req.user.id, 'owner']);
//     res.status(201).json(r.rows[0]);
//   } catch(e) { res.status(500).json({ error: e.message }); }
// });

// router.post('/:id/join', authMiddleware, async (req, res) => {
//   await query('INSERT INTO room_members (room_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
//   res.json({ joined: true });
// });

// router.get('/:id/messages', authMiddleware, async (req, res) => {
//   const r = await query(
//     `SELECT m.*,u.username,u.avatar_color FROM messages m
//      LEFT JOIN users u ON u.id=m.user_id
//      WHERE m.room_id=$1 ORDER BY m.created_at DESC LIMIT 50`,
//     [req.params.id]
//   );
//   res.json(r.rows.reverse());
// });

// router.get('/:id/members', authMiddleware, async (req, res) => {
//   const r = await query(
//     `SELECT u.id,u.username,u.avatar_color,u.status,rm.role FROM room_members rm
//      JOIN users u ON u.id=rm.user_id WHERE rm.room_id=$1`,
//     [req.params.id]
//   );
//   res.json(r.rows);
// });

// module.exports = router;

const express = require('express');
const bcrypt  = require('bcryptjs');
const { query } = require('../db');
const { generateToken, authMiddleware } = require('../auth');
const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields required' });
  if (username.length < 3)
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const exists = await query(
      'SELECT id FROM users WHERE username=$1 OR email=$2',
      [username, email]
    );
    if (exists.rows.length)
      return res.status(409).json({ error: 'Username or email already taken' });

    const hash = await bcrypt.hash(password, 12);
    const colors = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22'];
    const color  = colors[Math.floor(Math.random() * colors.length)];

    const r = await query(
      `INSERT INTO users (username, email, password_hash, avatar_color)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, avatar_color, created_at`,
      [username, email, hash, color]
    );

    const user = r.rows[0];
    res.status(201).json({ token: generateToken({ id: user.id, username: user.username }), user });
  } catch (e) {
    console.error('[Auth] Register error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  try {
    const r = await query('SELECT * FROM users WHERE email=$1', [email]);
    if (!r.rows[0])
      return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok)
      return res.status(401).json({ error: 'Invalid credentials' });

    await query('UPDATE users SET status=$1, last_seen=NOW() WHERE id=$2', ['online', r.rows[0].id]);

    const { password_hash, ...user } = r.rows[0];
    res.json({ token: generateToken({ id: user.id, username: user.username }), user });
  } catch (e) {
    console.error('[Auth] Login error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const r = await query(
      'SELECT id, username, email, avatar_color, status FROM users WHERE id=$1',
      [req.user.id]
    );
    r.rows[0] ? res.json(r.rows[0]) : res.status(404).json({ error: 'User not found' });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/users — list all users except self (for DM list)
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const r = await query(
      'SELECT id, username, avatar_color, status FROM users WHERE id != $1 ORDER BY username ASC',
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[Auth] Users list error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

// const express = require('express');
// const bcrypt  = require('bcryptjs');
// const { query } = require('../db');
// const { generateToken, authMiddleware } = require('../auth');
// const router = express.Router();

// router.post('/register', async (req, res) => {
//   const { username, email, password } = req.body;
//   if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
//   try {
//     const exists = await query('SELECT id FROM users WHERE username=$1 OR email=$2', [username, email]);
//     if (exists.rows.length) return res.status(409).json({ error: 'Username or email taken' });
//     const hash = await bcrypt.hash(password, 12);
//     const colors = ['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6'];
//     const color  = colors[Math.floor(Math.random() * colors.length)];
//     const r = await query(
//       'INSERT INTO users (username,email,password_hash,avatar_color) VALUES ($1,$2,$3,$4) RETURNING id,username,email,avatar_color',
//       [username, email, hash, color]
//     );
//     res.status(201).json({ token: generateToken({ id: r.rows[0].id, username }), user: r.rows[0] });
//   } catch(e) { res.status(500).json({ error: e.message }); }
// });

// router.post('/login', async (req, res) => {
//   const { email, password } = req.body;
//   if (!email || !password) return res.status(400).json({ error: 'All fields required' });
//   try {
//     const r = await query('SELECT * FROM users WHERE email=$1', [email]);
//     if (!r.rows[0]) return res.status(401).json({ error: 'Invalid credentials' });
//     const ok = await bcrypt.compare(password, r.rows[0].password_hash);
//     if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
//     await query('UPDATE users SET status=$1 WHERE id=$2', ['online', r.rows[0].id]);
//     const { password_hash, ...user } = r.rows[0];
//     res.json({ token: generateToken({ id: user.id, username: user.username }), user });
//   } catch(e) { res.status(500).json({ error: e.message }); }
// });

// router.get('/me', authMiddleware, async (req, res) => {
//   const r = await query('SELECT id,username,email,avatar_color,status FROM users WHERE id=$1', [req.user.id]);
//   r.rows[0] ? res.json(r.rows[0]) : res.status(404).json({ error: 'Not found' });
// });

// module.exports = router;

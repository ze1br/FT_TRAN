const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const generateToken = (p) => jwt.sign(p, JWT_SECRET, { expiresIn: '7d' });
const verifyToken  = (t) => jwt.verify(t, JWT_SECRET);

const authMiddleware = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  try { req.user = verifyToken(h.split(' ')[1]); next(); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
};

const socketAuthMiddleware = (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try { socket.user = verifyToken(token); next(); }
  catch { next(new Error('Invalid token')); }
};

module.exports = { generateToken, verifyToken, authMiddleware, socketAuthMiddleware };

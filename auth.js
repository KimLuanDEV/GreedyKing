import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { v4 as uuid } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET;

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export async function register(username, password) {
  if (!/^[\w\p{L}\p{M}]{2,20}$/u.test(username)) {
    throw new Error('Tên 2-20 ký tự, không khoảng trắng/ ký tự lạ.');
  }
  const passhash = await bcrypt.hash(password, 10);
  const id = uuid();
  await query('INSERT INTO users(id, username, passhash) VALUES ($1,$2,$3)', [id, username, passhash]);
  return { id, username, coins: 1000 };
}

export async function login(username, password) {
  const r = await query('SELECT * FROM users WHERE username=$1', [username]);
  if (!r.rows[0]) throw new Error('User not found');
  const ok = await bcrypt.compare(password, r.rows[0].passhash);
  if (!ok) throw new Error('Wrong password');
  return { id: r.rows[0].id, username: r.rows[0].username, coins: r.rows[0].coins };
}

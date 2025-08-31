import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { query } from './db.js';
import { authMiddleware, register, login, signToken } from './auth.js';
import { v4 as uuid } from 'uuid';
import { randomResult, settleBet, addToJackpot, getJackpot, OPTION_NAMES } from './game.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));

app.get('/health', (_,res)=>res.json({ok:true}));

app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing username/password' });
    const user = await register(username, password);
    const token = signToken({ id: user.id, username: user.username });
    res.json({ user, token });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing username/password' });
    const user = await login(username, password);
    const token = signToken({ id: user.id, username: user.username });
    res.json({ user, token });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/me', authMiddleware, async (req, res) => {
  const r = await query('SELECT id, username, coins FROM users WHERE id=$1', [req.user.id]);
  res.json(r.rows[0]);
});

app.get('/bets/history', authMiddleware, async (req, res) => {
  const r = await query('SELECT * FROM bets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  res.json(r.rows);
});

app.get('/jackpot', async (req, res) => {
  res.json({ coins: await getJackpot() });
});

app.post('/spin', authMiddleware, async (req, res) => {
  try {
    const { selection, amount } = req.body || {};
    if (!OPTION_NAMES.has(selection)) return res.status(400).json({ error: 'Bad selection' });
    const betAmount = Number(amount);
    if (!Number.isFinite(betAmount) || betAmount <= 0) return res.status(400).json({ error: 'Bad amount' });

    // limits (example)
    if (betAmount > 1000000) return res.status(400).json({ error: 'Amount too large' });

    const userQ = await query('SELECT id, coins FROM users WHERE id=$1', [req.user.id]);
    const user = userQ.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.coins < betAmount) return res.status(400).json({ error: 'Not enough coins' });

    const roundId = uuid();
    const serverPick = randomResult();

    const jackpotAdd = Math.floor(betAmount * 0.05);
    const newJackpot = await addToJackpot(jackpotAdd);

    const { result, payout } = settleBet({ selection, amount: betAmount, serverPick });

    const delta = -betAmount + payout;
    await query('UPDATE users SET coins = coins + $1 WHERE id=$2', [delta, req.user.id]);

    await query('INSERT INTO bets(id, user_id, round_id, selection, amount, result, payout) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uuid(), req.user.id, roundId, selection, betAmount, result, payout]);

    const after = await query('SELECT coins FROM users WHERE id=$1', [req.user.id]);

    io.emit('jackpot:update', { coins: newJackpot });
    io.emit('spin:result', { roundId, serverPick, selection, result, payout });

    res.json({ roundId, serverPick, result, payout, balance: after.rows[0].coins });
  } catch (e) {
    res.status(500).json({ error: 'Spin failed' });
  }
});

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: process.env.CORS_ORIGIN } });

io.on('connection', (socket) => {
  socket.emit('jackpot:update', { coins: 0 });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`API listening on :${PORT}`));

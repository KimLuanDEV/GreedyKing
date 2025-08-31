import { query } from './db.js';

export const OPTIONS = [
  { name: 'Chua', mult: 5 },
  { name: 'Cải',  mult: 5 },
  { name: 'Ngô',  mult: 5 },
  { name: 'Rốt',  mult: 5 },
  { name: 'Mỳ',   mult: 10 },
  { name: 'Xiên', mult: 15 },
  { name: 'Đùi',  mult: 25 },
  { name: 'Bò',   mult: 45 }
];

export const OPTION_NAMES = new Set(OPTIONS.map(o => o.name));

export function randomResult() {
  const idx = Math.floor(Math.random() * OPTIONS.length);
  return OPTIONS[idx];
}

export async function getJackpot() {
  const r = await query('SELECT value FROM state WHERE key=$1', ['jackpot']);
  return r.rows[0]?.value?.coins ?? 0;
}

export async function setJackpot(v) {
  await query('INSERT INTO state(key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
    ['jackpot', { coins: v }]);
}

export async function addToJackpot(delta) {
  const current = await getJackpot();
  const next = Math.max(0, current + delta);
  await setJackpot(next);
  return next;
}

export function settleBet({ selection, amount, serverPick }) {
  if (selection === serverPick.name) {
    const mult = OPTIONS.find(o => o.name === selection)?.mult ?? 1;
    return { result: 'WIN', payout: amount * mult };
  }
  return { result: 'LOSE', payout: 0 };
}

import pkg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getSSL()
});

function getSSL() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')) {
    return { rejectUnauthorized: false };
  }
  return false;
}

export async function query(q, params) {
  const client = await pool.connect();
  try { return await client.query(q, params); }
  finally { client.release(); }
}

if (process.argv[2] === 'init') {
  const sql = fs.readFileSync('./schema.sql', 'utf8');
  query(sql).then(()=>{ console.log('DB initialized'); process.exit(0);})
            .catch(e=>{ console.error(e); process.exit(1);});
}

if (process.argv[2] === 'reset') {
  const drop = `DROP TABLE IF EXISTS bets; DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS state;`;
  query(drop).then(async ()=>{
    const sql = fs.readFileSync('./schema.sql', 'utf8');
    await query(sql);
    console.log('DB reset');
    process.exit(0);
  }).catch(e=>{ console.error(e); process.exit(1); });
}

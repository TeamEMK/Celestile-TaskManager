import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

export async function GET() {
  const dbInfo = {
    host: process.env.DB_HOST || '(not set)',
    user: process.env.DB_USER || '(not set)',
    name: process.env.DB_NAME || '(not set)',
    pass_len: (process.env.DB_PASSWORD || '').length,
    pass_first3: (process.env.DB_PASSWORD || '').slice(0, 3),
  };
  try {
    await ensureSchema();
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    return NextResponse.json({ ok: true, users: Number(rows[0].cnt), dbInfo });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message, code: err.code, dbInfo }, { status: 500 });
  }
}

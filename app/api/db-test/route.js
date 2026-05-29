import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

export async function GET() {
  try {
    await ensureSchema();
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    return NextResponse.json({ ok: true, users: Number(rows[0].cnt) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 500 });
  }
}

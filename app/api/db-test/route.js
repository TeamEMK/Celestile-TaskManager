import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireDeveloper } from '@/lib/api';

// Connectivity smoke test. Developer-gated: it used to be open to the world
// and reported the DB host, user, database name and the first three characters
// plus exact length of DB_PASSWORD — enough to finish the guess offline.
// Nothing here reports a credential any more; the point is only "did the
// connection work", and the error code when it didn't.
export async function GET(req) {
  const gate = requireDeveloper(req); if (gate) return gate;

  const dbInfo = {
    host_set: !!process.env.DB_HOST,
    user_set: !!process.env.DB_USER,
    name_set: !!process.env.DB_NAME,
    password_set: !!process.env.DB_PASSWORD,
    sheets_mode: !!process.env.SHEETS_DB_ID,
  };
  try {
    await ensureSchema();
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    return NextResponse.json({ ok: true, users: Number(rows[0].cnt), dbInfo });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message, code: err.code, dbInfo }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireDeveloper } from '@/lib/api';

// Developer-gated: this reports which storage mode is live and a sample of the
// user table. It was open to the world, which made it a free directory of
// every employee's name and email plus the DB host/user/name.
export async function GET(req) {
  const gate = requireDeveloper(req); if (gate) return gate;
  try {
    const hasDB = !!(process.env.DB_HOST);
    const sheetsId = process.env.SHEETS_DB_ID || null;

    if (!hasDB) {
      return NextResponse.json({ mode: 'none', error: 'No DB_HOST configured' });
    }

    if (sheetsId) {
      return NextResponse.json({ mode: 'sheets', sheetsId: sheetsId.slice(0, 8) + '...' });
    }

    const { pool, ensureSchema } = await import('@/lib/db');
    await ensureSchema();
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    const [sample] = await pool.query('SELECT id, name, email, active FROM users ORDER BY id LIMIT 10');

    return NextResponse.json({
      mode: 'mysql',
      dbName: process.env.DB_NAME || '(not set)',
      userCount: rows[0].cnt,
      users: sample,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

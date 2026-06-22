import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const hasDB = !!(process.env.DB_HOST);
    const dbHost = process.env.DB_HOST || '(not set)';
    const dbName = process.env.DB_NAME || '(not set)';
    const dbUser = process.env.DB_USER || '(not set)';
    const sheetsId = process.env.SHEETS_DB_ID || null;

    if (!hasDB) {
      return NextResponse.json({ mode: 'none', error: 'No DB_HOST configured', dbHost, dbName, dbUser });
    }

    if (sheetsId) {
      return NextResponse.json({ mode: 'sheets', sheetsId: sheetsId.slice(0, 8) + '...', dbHost });
    }

    const { pool, ensureSchema } = await import('@/lib/db');
    await ensureSchema();
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    const [sample] = await pool.query('SELECT id, name, email, active FROM users ORDER BY id LIMIT 10');

    return NextResponse.json({
      mode: 'mysql',
      dbHost: dbHost.replace(/:\d+$/, ''), // strip port if any
      dbName,
      dbUser,
      userCount: rows[0].cnt,
      users: sample,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message, stack: err.stack?.split('\n').slice(0, 4) }, { status: 500 });
  }
}

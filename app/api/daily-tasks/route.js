import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

export async function GET(req) {
  try {
    await ensureSchema();
    const doerId = new URL(req.url).searchParams.get('doerId');
    const [rows] = doerId
      ? await pool.query(
          `SELECT id, entry_date AS entryDate, doer_id AS doerId, doer,
                  client, department, description, minutes, created_at AS createdAt
           FROM daily_tasks WHERE doer_id = ? ORDER BY entry_date DESC, created_at DESC`, [doerId])
      : await pool.query(
          `SELECT id, entry_date AS entryDate, doer_id AS doerId, doer,
                  client, department, description, minutes, created_at AS createdAt
           FROM daily_tasks ORDER BY entry_date DESC, created_at DESC`);
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await ensureSchema();
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!body.entryDate || !body.doer || rows.length === 0)
      return NextResponse.json({ error: 'entryDate, doer and at least one row required' }, { status: 400 });

    const [c] = await pool.query('SELECT COUNT(*) AS cnt FROM daily_tasks');
    let n = Number(c[0].cnt);

    for (const r of rows) {
      n += 1;
      const id = 'DT' + n.toString().padStart(5, '0');
      await pool.query(
        'INSERT INTO daily_tasks (id, entry_date, doer_id, doer, client, department, description, minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, body.entryDate, body.doerId || null, body.doer,
         r.client || '', r.department || '', r.description || '', Number(r.minutes) || 0]
      );
    }
    return NextResponse.json({ success: true, inserted: rows.length }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

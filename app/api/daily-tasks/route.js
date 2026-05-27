import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// GET /api/daily-tasks?doerId=U001        -> that user's entries
// GET /api/daily-tasks                     -> all entries (admin / reports)
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const doerId = url.searchParams.get('doerId');

    const rows = doerId
      ? await sql`
          SELECT id, entry_date AS "entryDate", doer_id AS "doerId", doer,
                 client, department, description, minutes,
                 created_at AS "createdAt"
          FROM daily_tasks
          WHERE doer_id = ${doerId}
          ORDER BY entry_date DESC, created_at DESC`
      : await sql`
          SELECT id, entry_date AS "entryDate", doer_id AS "doerId", doer,
                 client, department, description, minutes,
                 created_at AS "createdAt"
          FROM daily_tasks
          ORDER BY entry_date DESC, created_at DESC`;

    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/daily-tasks
// body: { entryDate, doerId, doer, rows: [{ client, department, description, minutes }] }
export async function POST(req) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!body.entryDate || !body.doer || rows.length === 0) {
      return NextResponse.json(
        { error: 'entryDate, doer and at least one row required' },
        { status: 400 }
      );
    }

    const countRes = await sql`SELECT COUNT(*) FROM daily_tasks`;
    let n = Number(countRes[0].count);

    for (const r of rows) {
      n += 1;
      const id = 'DT' + n.toString().padStart(5, '0');
      await sql`
        INSERT INTO daily_tasks
          (id, entry_date, doer_id, doer, client, department, description, minutes)
        VALUES (
          ${id}, ${body.entryDate}, ${body.doerId || null}, ${body.doer},
          ${r.client || ''}, ${r.department || ''}, ${r.description || ''},
          ${Number(r.minutes) || 0}
        )`;
    }

    return NextResponse.json({ success: true, inserted: rows.length }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Normalize a date string to ISO YYYY-MM-DD. Accepts YYYY-MM-DD or DD-MM-YYYY (or with /).
function normDate(s) {
  if (!s) return null;
  const t = s.trim().replaceAll('/', '-');
  // already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // DD-MM-YYYY?
  const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const [_, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

async function nextId() {
  const c = await sql`SELECT COUNT(*) FROM holidays`;
  return 'H' + (Number(c[0].count) + 1).toString().padStart(3, '0');
}

export async function GET() {
  try {
    const rows = await sql`
      SELECT id, date, name, type FROM holidays ORDER BY date ASC`;
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST body shapes:
//   single: { date, name, type? }
//   bulk:   { bulk: [{ date, name, type? }, ...] }
export async function POST(req) {
  try {
    const b = await req.json();

    if (Array.isArray(b.bulk)) {
      let inserted = 0, skipped = 0;
      for (const row of b.bulk) {
        const date = normDate(row.date);
        const name = (row.name || '').trim();
        if (!date || !name) { skipped++; continue; }
        const id = await nextId();
        await sql`
          INSERT INTO holidays (id, date, name, type)
          VALUES (${id}, ${date}, ${name}, ${row.type || 'Holiday'})`;
        inserted++;
      }
      return NextResponse.json({ success: true, inserted, skipped }, { status: 201 });
    }

    const date = normDate(b.date);
    const name = (b.name || '').trim();
    if (!date || !name) {
      return NextResponse.json({ error: 'date (YYYY-MM-DD or DD-MM-YYYY) and name required' }, { status: 400 });
    }
    const id = await nextId();
    await sql`
      INSERT INTO holidays (id, date, name, type)
      VALUES (${id}, ${date}, ${name}, ${b.type || 'Holiday'})`;
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await sql`DELETE FROM holidays WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

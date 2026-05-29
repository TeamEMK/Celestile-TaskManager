import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

function normDate(s) {
  if (!s) return null;
  const t = s.trim().replaceAll('/', '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

async function nextId() {
  const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM holidays');
  return 'H' + (Number(rows[0].cnt) + 1).toString().padStart(3, '0');
}

export async function GET() {
  try {
    await ensureSchema();
    const [rows] = await pool.query('SELECT id, date, name, type FROM holidays ORDER BY date ASC');
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await ensureSchema();
    const b = await req.json();

    if (Array.isArray(b.bulk)) {
      let inserted = 0, skipped = 0;
      for (const row of b.bulk) {
        const date = normDate(row.date);
        const name = (row.name || '').trim();
        if (!date || !name) { skipped++; continue; }
        const id = await nextId();
        await pool.query('INSERT INTO holidays (id, date, name, type) VALUES (?, ?, ?, ?)',
          [id, date, name, row.type || 'Holiday']);
        inserted++;
      }
      return NextResponse.json({ success: true, inserted, skipped }, { status: 201 });
    }

    const date = normDate(b.date);
    const name = (b.name || '').trim();
    if (!date || !name)
      return NextResponse.json({ error: 'date and name required' }, { status: 400 });
    const id = await nextId();
    await pool.query('INSERT INTO holidays (id, date, name, type) VALUES (?, ?, ?, ?)',
      [id, date, name, b.type || 'Holiday']);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    await ensureSchema();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await pool.query('DELETE FROM holidays WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

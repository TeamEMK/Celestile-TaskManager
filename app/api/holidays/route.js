import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/api';
import { newId } from '@/lib/ids';

function normDate(s) {
  if (!s) return null;
  const t = s.trim().replaceAll('/', '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

function nextWorkingDay(dateStr, holidaySet) {
  const d = new Date(dateStr + 'T00:00:00Z');
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || holidaySet.has(d.toISOString().slice(0, 10)));
  return d.toISOString().slice(0, 10);
}

async function rescheduleForHoliday(holidayDate) {
  try {
    const [rows] = await pool.query('SELECT date FROM holidays');
    const allHolidays = new Set(rows.map(r => {
      const v = r.date;
      return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
    }));
    const next = nextWorkingDay(holidayDate, allHolidays);
    await pool.query(
      `UPDATE delegations SET due_date = ? WHERE due_date = ? AND status != 'done'`,
      [next, holidayDate]
    );
    await pool.query(
      `UPDATE masters SET start_date = ? WHERE start_date = ?`,
      [next, holidayDate]
    );
  } catch (err) {
    console.error('[holiday reschedule]', err.message);
  }
}

// Collision-proof id (lib/ids.js). The old 'COUNT(*) + 1' scheme re-used a
// live id the moment any row had ever been deleted, and two concurrent
// inserts read the same count — both land as a duplicate-primary-key 500.
async function nextId() {
  return newId('H');
}

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const [rows] = await pool.query('SELECT id, date, name, type FROM holidays ORDER BY date ASC');
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireAdmin(); if (gate) return gate;
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
        await rescheduleForHoliday(date);
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
    await rescheduleForHoliday(date);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const gate = await requireAdmin(); if (gate) return gate;
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

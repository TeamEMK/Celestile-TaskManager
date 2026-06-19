import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const [rows] = await pool.query('SELECT * FROM checklist_completions ORDER BY completed_at DESC');
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const { masterId, doer } = await req.json();
    if (!masterId) return NextResponse.json({ error: 'masterId required' }, { status: 400 });

    const [c] = await pool.query('SELECT COUNT(*) AS cnt FROM checklist_completions');
    const id  = 'CC' + (Number(c[0].cnt) + 1).toString().padStart(3, '0');

    await pool.query(
      'INSERT INTO checklist_completions (id, master_id, doer, completed_at, date) VALUES (?, ?, ?, NOW(), CURDATE())',
      [id, masterId, doer || '']
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const { masterId } = await req.json();
    if (!masterId) return NextResponse.json({ error: 'masterId required' }, { status: 400 });

    await pool.query(
      'DELETE FROM checklist_completions WHERE master_id = ? AND date = CURDATE() LIMIT 1',
      [masterId]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

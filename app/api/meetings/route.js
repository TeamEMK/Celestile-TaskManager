import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';
import { newId } from '@/lib/ids';

export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const url  = new URL(req.url);
    const from = url.searchParams.get('from');
    const to   = url.searchParams.get('to');

    const [rows] = (from && to)
      ? await pool.query(
          `SELECT id, title, meeting_date AS date, start_time AS startTime,
                  end_time AS endTime, attendees, notes, created_by AS createdBy
           FROM meetings WHERE meeting_date BETWEEN ? AND ? ORDER BY meeting_date ASC, start_time ASC`,
          [from, to]
        )
      : await pool.query(
          `SELECT id, title, meeting_date AS date, start_time AS startTime,
                  end_time AS endTime, attendees, notes, created_by AS createdBy
           FROM meetings ORDER BY meeting_date ASC, start_time ASC`
        );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.title?.trim() || !body.date)
      return NextResponse.json({ error: 'title and date required' }, { status: 400 });

// Collision-proof id (lib/ids.js). The old 'COUNT(*) + 1' scheme re-used a
// live id the moment any row had ever been deleted, and two concurrent
// inserts read the same count — both land as a duplicate-primary-key 500.
    const id = newId('MTG');

    await pool.query(
      'INSERT INTO meetings (id, title, meeting_date, start_time, end_time, attendees, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, body.title.trim(), body.date, body.startTime || null, body.endTime || null,
       body.attendees || '', body.notes || '', body.createdBy || '']
    );
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await pool.query('DELETE FROM meetings WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

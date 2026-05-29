import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

export async function GET(req) {
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
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.title?.trim() || !body.date)
      return NextResponse.json({ error: 'title and date required' }, { status: 400 });

    const [c] = await pool.query('SELECT COUNT(*) AS cnt FROM meetings');
    const id  = 'MTG' + (Number(c[0].cnt) + 1).toString().padStart(4, '0');

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

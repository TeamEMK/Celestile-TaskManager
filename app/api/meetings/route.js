import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireAccess, requireUserCtx } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { newId } from '@/lib/ids';

export async function GET(req) {
  const gate = await requireAccess('/meetings'); if (gate) return gate;
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
    console.error('[meetings GET]', err.message);
    return NextResponse.json({ error: 'Failed to load meetings' }, { status: 500 });
  }
}

export async function POST(req) {
  const { gate, user: sessionUser } = await requireUserCtx(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.title?.trim() || !body.date)
      return NextResponse.json({ error: 'title and date required' }, { status: 400 });

// Collision-proof id (lib/ids.js). The old 'COUNT(*) + 1' scheme re-used a
// live id the moment any row had ever been deleted, and two concurrent
// inserts read the same count — both land as a duplicate-primary-key 500.
    const id = newId('MTG');

    // The organizer is the session, not whatever name the request carried —
    // otherwise a meeting could be falsely attributed to someone else (same
    // class of fix already applied to delegations/leaves/daily-tasks).
    await pool.query(
      'INSERT INTO meetings (id, title, meeting_date, start_time, end_time, attendees, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, body.title.trim(), body.date, body.startTime || null, body.endTime || null,
       body.attendees || '', body.notes || '', sessionUser.name || '']
    );
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error('[meetings POST]', err.message);
    return NextResponse.json({ error: 'Failed to schedule meeting' }, { status: 500 });
  }
}

export async function DELETE(req) {
  const { gate, user: sessionUser } = await requireUserCtx(); if (gate) return gate;
  try {
    await ensureSchema();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    // Only the organizer or an admin may cancel a meeting.
    const [[row]] = await pool.query('SELECT created_by AS createdBy FROM meetings WHERE id = ?', [id]);
    if (row && row.createdBy && row.createdBy !== sessionUser.name && !isAdminRoles(sessionUser.roles))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await pool.query('DELETE FROM meetings WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[meetings DELETE]', err.message);
    return NextResponse.json({ error: 'Failed to delete meeting' }, { status: 500 });
  }
}

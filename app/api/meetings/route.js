import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// GET /api/meetings?from=2026-05-01&to=2026-05-31  -> meetings in range
// GET /api/meetings                                 -> all upcoming
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const rows = (from && to)
      ? await sql`
          SELECT id, title, meeting_date AS "date", start_time AS "startTime",
                 end_time AS "endTime", attendees, notes, created_by AS "createdBy"
          FROM meetings
          WHERE meeting_date BETWEEN ${from} AND ${to}
          ORDER BY meeting_date ASC, start_time ASC`
      : await sql`
          SELECT id, title, meeting_date AS "date", start_time AS "startTime",
                 end_time AS "endTime", attendees, notes, created_by AS "createdBy"
          FROM meetings
          ORDER BY meeting_date ASC, start_time ASC`;

    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/meetings
// body: { title, date, startTime, endTime, attendees, notes, createdBy }
export async function POST(req) {
  try {
    const body = await req.json();
    if (!body.title?.trim() || !body.date) {
      return NextResponse.json({ error: 'title and date required' }, { status: 400 });
    }

    const countRes = await sql`SELECT COUNT(*) FROM meetings`;
    const id = 'MTG' + (Number(countRes[0].count) + 1).toString().padStart(4, '0');

    await sql`
      INSERT INTO meetings
        (id, title, meeting_date, start_time, end_time, attendees, notes, created_by)
      VALUES (
        ${id}, ${body.title.trim()}, ${body.date}, ${body.startTime || null},
        ${body.endTime || null}, ${body.attendees || ''}, ${body.notes || ''},
        ${body.createdBy || ''}
      )`;

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/meetings?id=MTG0001
export async function DELETE(req) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await sql`DELETE FROM meetings WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

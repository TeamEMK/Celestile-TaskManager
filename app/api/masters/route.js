import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export async function GET() {
  const masters = await sql`SELECT * FROM masters ORDER BY created_at DESC`;
  return NextResponse.json(masters);
}

export async function POST(req) {
  try {
    const body = await req.json();
    if (!body.task?.trim()) {
      return NextResponse.json({ error: 'Task required' }, { status: 400 });
    }

    const count = await sql`SELECT COUNT(*) FROM masters`;
    const id = 'CHK' + (Number(count[0].count) + 1).toString().padStart(3, '0');

    await sql`
      INSERT INTO masters (id, task, assigned_to, frequency, created_at)
      VALUES (
        ${id},
        ${body.task.trim()},
        ${body.assignedTo || ''},
        ${body.frequency || 'Daily'},
        NOW()
      )
    `;

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await sql`
      UPDATE masters SET
        task = COALESCE(${body.task}, task),
        assigned_to = COALESCE(${body.assignedTo}, assigned_to),
        frequency = COALESCE(${body.frequency}, frequency)
      WHERE id = ${body.id}
    `;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await sql`DELETE FROM masters WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
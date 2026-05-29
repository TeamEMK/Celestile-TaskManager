import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

export async function GET() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM masters ORDER BY created_at DESC');
  return NextResponse.json(rows);
}

export async function POST(req) {
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.task?.trim())
      return NextResponse.json({ error: 'Task required' }, { status: 400 });

    const [c] = await pool.query('SELECT COUNT(*) AS cnt FROM masters');
    const id  = 'CHK' + (Number(c[0].cnt) + 1).toString().padStart(3, '0');

    await pool.query(
      'INSERT INTO masters (id, task, assigned_to, frequency, created_at) VALUES (?, ?, ?, ?, NOW())',
      [id, body.task.trim(), body.assignedTo || '', body.frequency || 'Daily']
    );
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await pool.query(
      'UPDATE masters SET task = COALESCE(?, task), assigned_to = COALESCE(?, assigned_to), frequency = COALESCE(?, frequency) WHERE id = ?',
      [body.task ?? null, body.assignedTo ?? null, body.frequency ?? null, body.id]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    await ensureSchema();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await pool.query('DELETE FROM masters WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

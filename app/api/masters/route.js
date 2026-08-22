import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/api';
import { maybeUploadToDrive } from '@/lib/googleDrive';
import { newId } from '@/lib/ids';

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const [rows] = await pool.query('SELECT * FROM masters ORDER BY created_at DESC');
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const body = await req.json();
    await ensureSchema();

    // Bulk CSV upload
    if (Array.isArray(body.bulk)) {
      let inserted = 0; const errors = [];
      for (const [i, row] of body.bulk.entries()) {
        const email = (row.user_email || '').trim().toLowerCase();
        const desc  = (row.description || '').trim();
        if (!email || !desc) { errors.push(`Row ${i + 1}: missing fields`); continue; }
        const [users] = await pool.query('SELECT id, name FROM users WHERE LOWER(email) = ?', [email]);
        if (!users.length) { errors.push(`Row ${i + 1}: no user ${email}`); continue; }
        const id = newId('CHK');
        await pool.query(
          'INSERT INTO masters (id, task, assigned_to, frequency, start_date, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
          [id, desc, users[0].name, row.frequency || 'Daily', row.start_date || null]
        );
        inserted++;
      }
      return NextResponse.json({ success: true, inserted, errors }, { status: 201 });
    }

    if (!body.task?.trim())
      return NextResponse.json({ error: 'Task required' }, { status: 400 });

// Collision-proof id (lib/ids.js). The old 'COUNT(*) + 1' scheme re-used a
// live id the moment any row had ever been deleted, and two concurrent
// inserts read the same count — both land as a duplicate-primary-key 500.
    const id = newId('CHK');
    const attachment = await maybeUploadToDrive(body.attachment, 'checklist-attachment');
    await pool.query(
      'INSERT INTO masters (id, task, assigned_to, frequency, start_date, require_file, attachment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [id, body.task.trim(), body.assignedTo || '', body.frequency || 'Daily', body.startDate || null,
       body.requireFile ? 1 : 0, attachment || null]
    );
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await ensureSchema();
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
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await ensureSchema();
    await pool.query('DELETE FROM masters WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

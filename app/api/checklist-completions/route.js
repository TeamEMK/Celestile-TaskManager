import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';
import { maybeUploadToDrive } from '@/lib/googleDrive';
import { newId } from '@/lib/ids';

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
    const { masterId, doer, file } = await req.json();
    if (!masterId) return NextResponse.json({ error: 'masterId required' }, { status: 400 });

// Collision-proof id (lib/ids.js). The old 'COUNT(*) + 1' scheme re-used a
// live id the moment any row had ever been deleted, and two concurrent
// inserts read the same count — both land as a duplicate-primary-key 500.
    const id = newId('CC');
    const uploadedFile = await maybeUploadToDrive(file, 'checklist-completion');

    await pool.query(
      'INSERT INTO checklist_completions (id, master_id, doer, file, completed_at, date) VALUES (?, ?, ?, ?, NOW(), CURDATE())',
      [id, masterId, doer || '', uploadedFile || null]
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

    // The Sheets SQL engine parses neither `DELETE ... LIMIT 1` nor CURDATE()
    // in a WHERE — pick today's row in JS and delete it by id, which also
    // keeps the "exactly one row" semantics the LIMIT 1 was there for.
    const utcToday = new Date().toISOString().slice(0, 10);
    const istToday = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const dstr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10));
    const [rows] = await pool.query(
      'SELECT id, date FROM checklist_completions WHERE master_id = ?', [masterId]);
    const target = rows.find((r) => { const d = dstr(r.date); return d === utcToday || d === istToday; });
    if (target) {
      await pool.query('DELETE FROM checklist_completions WHERE id = ?', [target.id]);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

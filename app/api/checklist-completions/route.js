import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser, requireUserCtx } from '@/lib/api';
import { maybeUploadToDrive } from '@/lib/googleDrive';
import { newId } from '@/lib/ids';
import { isAdminRoles } from '@/lib/pages';

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const [rows] = await pool.query('SELECT * FROM checklist_completions ORDER BY completed_at DESC');
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[checklist-completions GET]', err.message);
    return NextResponse.json({ error: 'Failed to load checklist completions' }, { status: 500 });
  }
}

// A checklist "belongs" to whoever its master row is assigned to — only that
// person (or an admin) may mark it done or undo it. Loaded once and shared by
// POST/DELETE below.
async function assignedTo(masterId) {
  const [[m]] = await pool.query('SELECT assigned_to FROM masters WHERE id = ?', [masterId]);
  return m?.assigned_to || '';
}

export async function POST(req) {
  const { gate, user: sessionUser } = await requireUserCtx(); if (gate) return gate;
  try {
    await ensureSchema();
    const { masterId, file } = await req.json();
    if (!masterId) return NextResponse.json({ error: 'masterId required' }, { status: 400 });

    const owner = await assignedTo(masterId);
    const isAdmin = isAdminRoles(sessionUser.roles);
    if (owner && sessionUser.name !== owner && !isAdmin)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // The doer of record is the session user (or the master's assignee, for
    // an admin completing on someone's behalf) — never a client-supplied
    // name, so a completion can't be falsely attributed.
    const doer = isAdmin && owner ? owner : sessionUser.name || '';

// Collision-proof id (lib/ids.js). The old 'COUNT(*) + 1' scheme re-used a
// live id the moment any row had ever been deleted, and two concurrent
// inserts read the same count — both land as a duplicate-primary-key 500.
    const id = newId('CC');
    const uploadedFile = await maybeUploadToDrive(file, 'checklist-completion');

    await pool.query(
      'INSERT INTO checklist_completions (id, master_id, doer, file, completed_at, date) VALUES (?, ?, ?, ?, NOW(), CURDATE())',
      [id, masterId, doer, uploadedFile || null]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[checklist-completions POST]', err.message);
    return NextResponse.json({ error: 'Failed to save checklist completion' }, { status: 500 });
  }
}

export async function DELETE(req) {
  const { gate, user: sessionUser } = await requireUserCtx(); if (gate) return gate;
  try {
    await ensureSchema();
    const { masterId } = await req.json();
    if (!masterId) return NextResponse.json({ error: 'masterId required' }, { status: 400 });

    const owner = await assignedTo(masterId);
    if (owner && sessionUser.name !== owner && !isAdminRoles(sessionUser.roles))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
    console.error('[checklist-completions DELETE]', err.message);
    return NextResponse.json({ error: 'Failed to undo checklist completion' }, { status: 500 });
  }
}

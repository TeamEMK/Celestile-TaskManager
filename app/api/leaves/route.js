import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser, requireAdmin, currentUser } from '@/lib/api';
import { newId } from '@/lib/ids';
import { isAdminRoles } from '@/lib/pages';

export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const userId = new URL(req.url).searchParams.get('userId');
    const [rows] = userId
      ? await pool.query(
          `SELECT id, user_id AS userId, user_name AS userName, type,
                  from_date AS fromDate, to_date AS toDate, reason, status,
                  approver, created_at AS createdAt, decided_at AS decidedAt
           FROM leaves WHERE user_id = ? ORDER BY created_at DESC`, [userId])
      : await pool.query(
          `SELECT id, user_id AS userId, user_name AS userName, type,
                  from_date AS fromDate, to_date AS toDate, reason, status,
                  approver, created_at AS createdAt, decided_at AS decidedAt
           FROM leaves ORDER BY created_at DESC`);
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  const sessionUser = await currentUser();
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.fromDate || !body.toDate)
      return NextResponse.json({ error: 'fromDate and toDate required' }, { status: 400 });

    // The applicant is the session, not whatever name the request carried —
    // otherwise anyone could file leave in a colleague's name. An admin may
    // still apply on someone's behalf by naming them explicitly.
    let userId = sessionUser.id;
    let userName = sessionUser.name || '';
    if (isAdminRoles(sessionUser.roles) && body.userId && String(body.userId) !== String(sessionUser.id)) {
      const [target] = await pool.query('SELECT id, name FROM users WHERE id = ?', [String(body.userId)]);
      if (!target.length) return NextResponse.json({ error: 'Unknown user' }, { status: 400 });
      userId = target[0].id;
      userName = target[0].name;
    }

// Collision-proof id (lib/ids.js). The old 'COUNT(*) + 1' scheme re-used a
// live id the moment any row had ever been deleted, and two concurrent
// inserts read the same count — both land as a duplicate-primary-key 500.
    const id = newId('LV');

    await pool.query(
      'INSERT INTO leaves (id, user_id, user_name, type, from_date, to_date, reason, status, approver) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, userId || null, userName, body.type || 'Leave',
       body.fromDate, body.toDate, body.reason || '', 'pending', body.approver || 'HOD']
    );
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.id || !body.status)
      return NextResponse.json({ error: 'id and status required' }, { status: 400 });
    await pool.query('UPDATE leaves SET status = ?, decided_at = NOW() WHERE id = ?',
      [body.status, body.id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

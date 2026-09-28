import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUserCtx } from '@/lib/api';
import { newId } from '@/lib/ids';
import { isAdminRoles } from '@/lib/pages';
import {
  LEAVE_TYPES, canDecideLeave, resolveApprover, readQuotas, getHolidaySet,
  countLeaveDays, getUserBalances,
} from '@/lib/leaves';
import { sendWhatsApp, isWhatsappConfigured, leaveAppliedMessage, leaveDecisionMessage } from '@/lib/whatsapp';

export async function GET(req) {
  const { gate, user: caller } = await requireUserCtx(); if (gate) return gate;
  try {
    await ensureSchema();
    let userId = new URL(req.url).searchParams.get('userId');
    // Leave reasons are HR-sensitive. A non-admin may only ever see their own
    // leave applications — omitting userId used to return every employee's
    // leave history (reasons included), and an arbitrary userId let anyone
    // read a specific colleague's.
    if (!isAdminRoles(caller.roles)) userId = caller.id;
    const [rows] = userId
      ? await pool.query(
          `SELECT id, user_id AS userId, user_name AS userName, type,
                  from_date AS fromDate, to_date AS toDate, reason, status,
                  approver, approver_id AS approverId, created_at AS createdAt, decided_at AS decidedAt
           FROM leaves WHERE user_id = ? ORDER BY created_at DESC`, [userId])
      : await pool.query(
          `SELECT id, user_id AS userId, user_name AS userName, type,
                  from_date AS fromDate, to_date AS toDate, reason, status,
                  approver, approver_id AS approverId, created_at AS createdAt, decided_at AS decidedAt
           FROM leaves ORDER BY created_at DESC`);
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[leaves GET]', err.message);
    return NextResponse.json({ error: 'Failed to load leaves' }, { status: 500 });
  }
}

export async function POST(req) {
  const { gate, user: sessionUser } = await requireUserCtx(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.fromDate || !body.toDate)
      return NextResponse.json({ error: 'fromDate and toDate required' }, { status: 400 });
    if (String(body.toDate) < String(body.fromDate))
      return NextResponse.json({ error: 'toDate must be on or after fromDate' }, { status: 400 });

    // The applicant is the session, not whatever name the request carried —
    // otherwise anyone could file leave in a colleague's name. An admin may
    // still apply on someone's behalf by naming them explicitly.
    let userId = sessionUser.id;
    let userName = sessionUser.name || '';
    let department = sessionUser.department || '';
    if (isAdminRoles(sessionUser.roles) && body.userId && String(body.userId) !== String(sessionUser.id)) {
      const [target] = await pool.query('SELECT id, name, department FROM users WHERE id = ?', [String(body.userId)]);
      if (!target.length) return NextResponse.json({ error: 'Unknown user' }, { status: 400 });
      userId = target[0].id;
      userName = target[0].name;
      department = target[0].department || '';
    }

    const type = LEAVE_TYPES.includes(body.type) ? body.type : 'Leave';

    // Quota check — only for a type with a configured (>0) annual quota, and
    // only against the year the leave starts in.
    const quotas = await readQuotas();
    const quota = Number(quotas[type] || 0);
    if (quota > 0) {
      const holidaySet = await getHolidaySet();
      const requested = countLeaveDays(body.fromDate, body.toDate, holidaySet);
      const year = String(body.fromDate).slice(0, 4);
      const balances = await getUserBalances(userId, year, { quotas, holidaySet });
      const bal = balances.find((b) => b.type === type);
      if (bal && bal.remaining != null && requested > bal.remaining) {
        return NextResponse.json(
          { error: `Insufficient ${type} balance — ${bal.remaining} of ${bal.quota} day(s) left for ${year}` },
          { status: 400 }
        );
      }
    }

    const approver = await resolveApprover(department);

// Collision-proof id (lib/ids.js). The old 'COUNT(*) + 1' scheme re-used a
// live id the moment any row had ever been deleted, and two concurrent
// inserts read the same count — both land as a duplicate-primary-key 500.
    const id = newId('LV');

    await pool.query(
      'INSERT INTO leaves (id, user_id, user_name, type, from_date, to_date, reason, status, approver, approver_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, userId || null, userName, type,
       body.fromDate, body.toDate, body.reason || '', 'pending', approver?.name || body.approver || 'HOD', approver?.id || null]
    );

    // Best-effort — a messaging failure must never fail the write that already happened.
    if (approver?.id && isWhatsappConfigured()) {
      try {
        const [rows] = await pool.query('SELECT phone FROM users WHERE id = ?', [approver.id]);
        const phone = rows[0]?.phone;
        if (phone) {
          await sendWhatsApp(phone, leaveAppliedMessage({
            approverName: approver.name, applicantName: userName, type,
            fromDate: body.fromDate, toDate: body.toDate, reason: body.reason,
          }));
        }
      } catch (e) { console.error('[leaves notifyApplied]', e.message); }
    }

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error('[leaves POST]', err.message);
    return NextResponse.json({ error: 'Failed to save leave application' }, { status: 500 });
  }
}

export async function PATCH(req) {
  const { gate, user: caller } = await requireUserCtx(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.id || !body.status)
      return NextResponse.json({ error: 'id and status required' }, { status: 400 });
    if (!['approved', 'rejected'].includes(body.status))
      return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 });

    const [rows] = await pool.query('SELECT * FROM leaves WHERE id = ?', [body.id]);
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Leave not found' }, { status: 404 });

    // Department-wise routing (lib/leaves.js): Admin always decides; an HOD
    // only decides a leave routed to them, unless its department has no
    // configured approver, in which case any HOD may — same as before routing.
    if (!canDecideLeave(row, caller.id, caller.roles))
      return NextResponse.json({ error: 'Not allowed to decide this leave' }, { status: 403 });

    await pool.query('UPDATE leaves SET status = ?, decided_at = NOW() WHERE id = ?',
      [body.status, body.id]);

    if (isWhatsappConfigured() && row.user_id) {
      try {
        const [urows] = await pool.query('SELECT phone FROM users WHERE id = ?', [row.user_id]);
        const phone = urows[0]?.phone;
        if (phone) {
          await sendWhatsApp(phone, leaveDecisionMessage({
            applicantName: row.user_name, type: row.type, fromDate: row.from_date, toDate: row.to_date,
            status: body.status, decidedByName: caller.name || '',
          }));
        }
      } catch (e) { console.error('[leaves notifyDecision]', e.message); }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[leaves PATCH]', err.message);
    return NextResponse.json({ error: 'Failed to update leave' }, { status: 500 });
  }
}

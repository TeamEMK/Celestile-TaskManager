import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { currentUser } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import {
  getTicketRow, listEvents, updateTicket, shapeTicket, userNames, authorizePatch,
  canViewTicket, canManageTicket, canCommentTicket, canReopenTicket,
  STATUSES, PRIORITIES, DONE_STATUSES,
} from '@/lib/helpTickets';
import {
  sendWhatsApp, isWhatsappConfigured,
  helpTicketAssignedMessage, helpTicketResolvedMessage,
} from '@/lib/whatsapp';

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// Best-effort WhatsApp notices. A messaging failure must never fail the write
// that already happened — same as delegations.
async function notifyAssigned({ ticket, byName }) {
  try {
    if (!isWhatsappConfigured() || !ticket.assigned_to_id) return;
    const [rows] = await pool.query('SELECT name, phone FROM users WHERE id = ?', [ticket.assigned_to_id]);
    const assignee = rows[0];
    if (!assignee?.phone) { console.error('[helpTicket:notifyAssigned] skipped — no phone on file:', assignee?.name || ticket.assigned_to_id); return; }
    await sendWhatsApp(assignee.phone, helpTicketAssignedMessage({
      assigneeName: assignee.name,
      ticketId: ticket.id,
      subject: ticket.subject,
      priority: ticket.priority,
      category: ticket.category,
      dueDate: ticket.due_date,
      byName,
    }));
  } catch (e) { console.error('[helpTicket:notifyAssigned]', e.message); }
}

async function notifyResolved({ ticket, resolvedByName }) {
  try {
    if (!isWhatsappConfigured() || !ticket.raised_by_id) return;
    const [rows] = await pool.query('SELECT name, phone FROM users WHERE id = ?', [ticket.raised_by_id]);
    const raiser = rows[0];
    if (!raiser?.phone) { console.error('[helpTicket:notifyResolved] skipped — no phone on file:', raiser?.name || ticket.raised_by_id); return; }
    await sendWhatsApp(raiser.phone, helpTicketResolvedMessage({
      raiserName: raiser.name,
      ticketId: ticket.id,
      subject: ticket.subject,
      resolvedByName,
    }));
  } catch (e) { console.error('[helpTicket:notifyResolved]', e.message); }
}

// One ticket with its event thread. Visible to the raiser, the assignee and
// admins; to anyone else the ticket does not exist.
export async function GET(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const isAdmin = isAdminRoles(user.roles);
    const row = await getTicketRow(id);
    if (!row || !canViewTicket(row, user.id, isAdmin)) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    const [names, events] = await Promise.all([userNames(), listEvents(id)]);
    return NextResponse.json({
      ticket: shapeTicket(row, names),
      events,
      // What this user may do — so the page draws only the controls that would
      // actually be accepted. The server re-checks every one of them below.
      can: {
        manage: canManageTicket(row, user.id, isAdmin),
        comment: canCommentTicket(row, user.id, isAdmin),
        reopen: canReopenTicket(row, user.id, isAdmin),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Change status, assignee, priority or due date.
 *
 * Being signed in is not enough: the check is against THIS ticket. Admins and
 * the current assignee may change anything; the person who raised it may do
 * exactly one thing — reopen it once it has been resolved or closed.
 */
export async function PATCH(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const isAdmin = isAdminRoles(user.roles);
    const row = await getTicketRow(id);
    // Same 404 as a ticket that isn't there — no probing ids you can't see.
    if (!row || !canViewTicket(row, user.id, isAdmin)) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const body = await req.json();
    const patch = {};

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority)) {
        return NextResponse.json({ error: 'Unknown priority' }, { status: 400 });
      }
      patch.priority = body.priority;
    }
    if (body.dueDate !== undefined) {
      const d = body.dueDate ? String(body.dueDate).slice(0, 10) : '';
      if (d && !isDay(d)) return NextResponse.json({ error: 'dueDate must be YYYY-MM-DD' }, { status: 400 });
      patch.dueDate = d || null;
    }
    if (body.assignedToId !== undefined) {
      const to = body.assignedToId ? String(body.assignedToId) : '';
      if (to) {
        // active = 1, matching the assignee dropdown the UI builds this
        // choice from — userNames() (used for display, not gating) resolves
        // everyone including deactivated staff, so it can't gate this.
        const [rows] = await pool.query('SELECT id FROM users WHERE id = ? AND active = 1', [to]);
        if (!rows.length) return NextResponse.json({ error: 'Unknown assignee' }, { status: 400 });
      }
      patch.assignedToId = to || null;
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    // Who may make THIS change to THIS ticket — see authorizePatch() for the
    // rules. Admins and the assignee may change anything; the raiser may only
    // reopen a finished ticket.
    const gate = authorizePatch(row, patch, user.id, isAdmin);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const result = await updateTicket(id, patch, { actorId: user.id });
    if (!result) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    const names = await userNames();
    if (result.changed.assignedToId) {
      // The actor making this change, not the ticket's raiser — raisers can
      // never set assignedToId (see authorizePatch), so the raiser was
      // effectively always the wrong name here.
      await notifyAssigned({ ticket: result.ticket, byName: user.name || '' });
    }
    // Fires on the first move into a done status, whichever one — resolved,
    // or straight to closed (see updateTicket's resolved_at comment above).
    if (result.changed.status && DONE_STATUSES.includes(result.changed.status)
      && !DONE_STATUSES.includes(result.before.status)) {
      await notifyResolved({ ticket: result.ticket, resolvedByName: user.name || '' });
    }

    return NextResponse.json({ success: true, ticket: shapeTicket(result.ticket, names) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Help Tickets — the internal issue queue.
 *
 * Staff raise a ticket for the admin team; an admin picks it up, optionally
 * assigns it, works it and resolves it. Nothing is ever hard-deleted — a
 * finished ticket ends at resolved/closed and stays on the list.
 *
 * Every write lands in `help_ticket_events` as well, so the ticket page can
 * show who changed what and why. Routes stay thin (see app/api/help-tickets/*)
 * and all the SQL plus the permission rules live here.
 *
 * Two engines: MySQL (production) and the Google-Sheets SQL subset
 * (lib/sql-sheets.js, what this install runs). The subset has no OR, no LIKE
 * and no OFFSET, so the two places that need them branch on USE_SHEETS and do
 * that part in JS instead — both are marked below.
 */
import { pool, ensureSchema, USE_SHEETS } from '@/lib/db';

export const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
// The machine value is what's stored; this is the only place a label is decided.
export const STATUS_LABELS = {
  open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed',
};
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const EVENT_KINDS = ['comment', 'status', 'assign'];
// A ticket counts as unresolved until it reaches one of these.
export const DONE_STATUSES = ['resolved', 'closed'];

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// COUNT(*)+1 ids collide the moment a row has ever been deleted, and a bare
// timestamp collides between two tickets raised in the same millisecond — so,
// like delegations and quotations, the id is timestamp + random.
const nextTicketId = () => 'HT' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
const nextEventId = () => 'HTE' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

/* ── permissions ───────────────────────────────────────────────────────
   The single source of truth for who may do what. Every write route calls
   these against the ticket being changed — the list route filtering by user
   is not a control, it only decides what you can see. The UI reads the same
   answers (the API hands them back per ticket) so buttons that would 403
   aren't drawn, but that is a courtesy, not the check. */

const same = (a, b) => !!a && !!b && String(a) === String(b);

// Raiser, assignee or an admin. Anyone else gets 404 on the detail route.
export function canViewTicket(t, userId, isAdmin) {
  return !!isAdmin || same(t.raised_by_id, userId) || same(t.assigned_to_id, userId);
}
// Status / assignee / priority / due date: admin, or the current assignee.
export function canManageTicket(t, userId, isAdmin) {
  return !!isAdmin || same(t.assigned_to_id, userId);
}
// Commenting: whoever raised it, whoever holds it, or an admin.
export function canCommentTicket(t, userId, isAdmin) {
  return !!isAdmin || same(t.raised_by_id, userId) || same(t.assigned_to_id, userId);
}
// Reopening a resolved/closed ticket: the raiser (they are the one who knows
// the problem is still there) or an admin.
export function canReopenTicket(t, userId, isAdmin) {
  return !!isAdmin || same(t.raised_by_id, userId);
}

/**
 * The whole decision behind PATCH /help-tickets/:id, in one place so it can be
 * read (and tested) without a running server.
 *
 * - Can't see the ticket → 404, the same answer as a ticket that isn't there,
 *   so ids can't be probed by watching 403s.
 * - Admin or current assignee → anything.
 * - Raiser → exactly one thing: reopening a resolved/closed ticket, and only
 *   when status is the ONLY field in the patch. Bundling `assignedToId` into a
 *   reopen would otherwise let a raiser hand themselves the assignee's rights.
 * - Anyone else → 403.
 */
export function authorizePatch(t, patch, userId, isAdmin) {
  if (!canViewTicket(t, userId, isAdmin)) return { ok: false, status: 404, error: 'Ticket not found' };
  if (canManageTicket(t, userId, isAdmin)) return { ok: true, status: 200 };

  const keys = Object.keys(patch);
  const onlyStatus = keys.length === 1 && patch.status !== undefined;
  const isReopen = patch.status !== undefined
    && DONE_STATUSES.includes(t.status)
    && !DONE_STATUSES.includes(patch.status);
  if (onlyStatus && isReopen && canReopenTicket(t, userId, isAdmin)) {
    return { ok: true, status: 200, reopen: true };
  }
  return { ok: false, status: 403, error: 'Not allowed to change this ticket' };
}

/* ── shaping ──────────────────────────────────────────────────────────── */

// The sheets engine stores NULL as '' — normalise both engines to null so the
// UI has one thing to test.
const nn = (v) => (v === '' || v === undefined ? null : v);

export function shapeTicket(r, names = new Map()) {
  return {
    id: r.id,
    subject: r.subject,
    description: nn(r.description),
    category: r.category || '',
    priority: r.priority || 'Medium',
    status: r.status || 'open',
    statusLabel: STATUS_LABELS[r.status] || r.status,
    raisedById: nn(r.raised_by_id),
    raisedBy: names.get(String(r.raised_by_id)) || '—',
    assignedToId: nn(r.assigned_to_id),
    assignedTo: names.get(String(r.assigned_to_id)) || null,
    dueDate: nn(r.due_date),
    resolvedAt: nn(r.resolved_at),
    createdAt: nn(r.created_at),
    updatedAt: nn(r.updated_at),
  };
}

export function shapeEvent(r, names = new Map()) {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    actorId: nn(r.actor_id),
    actor: names.get(String(r.actor_id)) || '—',
    kind: r.kind || 'comment',
    body: r.body || '',
    createdAt: nn(r.created_at),
  };
}

// id -> name for everyone, in one query. The sheets engine has no JOIN and the
// users table is small, so both engines resolve names the same way.
export async function userNames() {
  const [rows] = await pool.query('SELECT id, name FROM users');
  return new Map(rows.map((u) => [String(u.id), u.name]));
}

/* ── reads ────────────────────────────────────────────────────────────── */

function buildFilters({ status, priority, assigneeId, from, to }) {
  const conds = [], params = [];
  if (status && STATUSES.includes(status)) { conds.push('status = ?'); params.push(status); }
  if (priority && PRIORITIES.includes(priority)) { conds.push('priority = ?'); params.push(priority); }
  if (assigneeId === 'unassigned') conds.push('assigned_to_id IS NULL');
  else if (assigneeId) { conds.push('assigned_to_id = ?'); params.push(assigneeId); }
  // The date range is on when the ticket was raised — the column a queue reads by.
  if (from) { conds.push('created_at >= ?'); params.push(from + ' 00:00:00'); }
  if (to) { conds.push('created_at <= ?'); params.push(to + ' 23:59:59'); }
  return { conds, params };
}

/**
 * One page of tickets. A non-admin only ever gets their own — raised by them
 * or assigned to them — enforced here, not in the caller.
 */
export async function listTickets(opts = {}) {
  await ensureSchema();
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(opts.pageSize, 10) || DEFAULT_PAGE_SIZE));
  const isAdmin = !!opts.isAdmin;
  const viewerId = opts.viewerId;
  const search = String(opts.q || '').trim();
  const { conds, params } = buildFilters(opts);

  let rows = [], total = 0;

  if (!USE_SHEETS) {
    if (search) {
      conds.push('(subject LIKE ? OR description LIKE ?)');
      params.push('%' + search + '%', '%' + search + '%');
    }
    if (!isAdmin) {
      conds.push('(raised_by_id = ? OR assigned_to_id = ?)');
      params.push(viewerId, viewerId);
    }
    const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    const [cnt] = await pool.query('SELECT COUNT(*) AS cnt FROM help_tickets' + where, params);
    total = Number(cnt[0]?.cnt || 0);
    // LIMIT/OFFSET are interpolated rather than bound — both are integers this
    // function computed itself (parseInt + clamp), never caller text.
    const offset = (page - 1) * pageSize;
    [rows] = await pool.query(
      'SELECT * FROM help_tickets' + where + ` ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );
  } else {
    // Sheets: the engine has no OR, no LIKE and no OFFSET. The filters it can
    // do run as SQL; scope, search and the page slice happen here. The table is
    // a tab in a spreadsheet — it is already fully in memory either way.
    const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    const [all] = await pool.query('SELECT * FROM help_tickets' + where + ' ORDER BY created_at DESC', params);
    let list = all;
    if (!isAdmin) list = list.filter((r) => same(r.raised_by_id, viewerId) || same(r.assigned_to_id, viewerId));
    if (search) {
      const needle = search.toLowerCase();
      list = list.filter((r) => `${r.subject || ''} ${r.description || ''}`.toLowerCase().includes(needle));
    }
    total = list.length;
    rows = list.slice((page - 1) * pageSize, page * pageSize);
  }

  const names = await userNames();
  return {
    rows: rows.map((r) => shapeTicket(r, names)),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Raw row (snake_case) — the permission helpers read it, so it must not be the
// shaped/camelCase version the API hands to the browser.
export async function getTicketRow(id) {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM help_tickets WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function listEvents(ticketId) {
  const [rows] = await pool.query(
    'SELECT * FROM help_ticket_events WHERE ticket_id = ? ORDER BY created_at ASC',
    [ticketId]
  );
  const names = await userNames();
  return rows.map((r) => shapeEvent(r, names));
}

// Unresolved tickets the caller can see — the sidebar badge.
export async function openTicketCount({ viewerId, isAdmin }) {
  await ensureSchema();
  // `status != 'x' AND status != 'y'` rather than NOT IN: both engines take it.
  const base = "status != 'resolved' AND status != 'closed'";
  if (!USE_SHEETS) {
    const sql = isAdmin
      ? `SELECT COUNT(*) AS cnt FROM help_tickets WHERE ${base}`
      : `SELECT COUNT(*) AS cnt FROM help_tickets WHERE ${base} AND (raised_by_id = ? OR assigned_to_id = ?)`;
    const [rows] = await pool.query(sql, isAdmin ? [] : [viewerId, viewerId]);
    return Number(rows[0]?.cnt || 0);
  }
  const [rows] = await pool.query(`SELECT * FROM help_tickets WHERE ${base}`);
  if (isAdmin) return rows.length;
  return rows.filter((r) => same(r.raised_by_id, viewerId) || same(r.assigned_to_id, viewerId)).length;
}

/* ── writes ───────────────────────────────────────────────────────────── */

// `conn` is optional — pass one to fold this into an existing transaction
// (see createTicket/updateTicket below), otherwise it runs as its own write.
async function addEvent({ conn, ticketId, actorId, kind, body }) {
  await (conn || pool).query(
    'INSERT INTO help_ticket_events (id, ticket_id, actor_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
    [nextEventId(), ticketId, actorId, kind, body || '']
  );
}

/**
 * Raise a ticket. `raisedById` comes from the session in the route — never from
 * the request body, or a form could file a ticket as somebody else.
 */
export async function createTicket({ subject, description, category, priority, raisedById }) {
  await ensureSchema();
  const id = nextTicketId();
  const prio = PRIORITIES.includes(priority) ? priority : 'Medium';
  // The ticket row and its opening trail entry must land together — a failure
  // between the two used to be able to leave a ticket with no history at all.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO help_tickets
         (id, subject, description, category, priority, status, raised_by_id,
          assigned_to_id, due_date, resolved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, NULL, NULL, NULL, NOW(), NOW())`,
      [id, subject, description || '', category || '', prio, raisedById]
    );
    // Opens the thread, so the detail page reads as a history from its first row.
    await addEvent({ conn, ticketId: id, actorId: raisedById, kind: 'status', body: 'Raised the ticket' });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return id;
}

const fmtDay = (d) => {
  const s = String(d || '').slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
};

/**
 * Apply a patch and write the matching trail entries. Returns what actually
 * changed, so the route knows who to notify.
 *
 * `kind` stays the three kinds the trail is defined with: an assignee change is
 * 'assign', any other field change is 'status' (the body carries the detail),
 * and a written note is 'comment'.
 */
export async function updateTicket(id, patch, { actorId }) {
  const before = await getTicketRow(id);
  if (!before) return null;

  const sets = [], params = [], events = [];
  const changed = {};

  if (patch.status !== undefined && patch.status !== before.status) {
    sets.push('status = ?'); params.push(patch.status);
    events.push({
      kind: 'status',
      body: `Status: ${STATUS_LABELS[before.status] || before.status} → ${STATUS_LABELS[patch.status] || patch.status}`,
    });
    changed.status = patch.status;
    // resolved_at is what turnaround reporting reads, so it follows the status
    // in both directions: stamped the moment a ticket first reaches a DONE
    // status (open/in_progress -> resolved OR straight to closed — the UI
    // lets either happen), left alone on a done-to-done move (e.g. resolved
    // -> closed shouldn't overwrite the original resolve time), and cleared
    // on reopen.
    if (DONE_STATUSES.includes(patch.status) && !DONE_STATUSES.includes(before.status)) {
      sets.push('resolved_at = NOW()');
    } else if (!DONE_STATUSES.includes(patch.status)) {
      sets.push('resolved_at = NULL');
    }
  }

  if (patch.assignedToId !== undefined) {
    const next = patch.assignedToId || null;
    const prev = before.assigned_to_id || null;
    if (String(next || '') !== String(prev || '')) {
      sets.push('assigned_to_id = ?'); params.push(next);
      const names = await userNames();
      events.push({
        kind: 'assign',
        body: next ? `Assigned to ${names.get(String(next)) || next}` : 'Unassigned',
      });
      changed.assignedToId = next;
    }
  }

  if (patch.priority !== undefined && patch.priority !== before.priority) {
    sets.push('priority = ?'); params.push(patch.priority);
    events.push({ kind: 'status', body: `Priority: ${before.priority} → ${patch.priority}` });
    changed.priority = patch.priority;
  }

  if (patch.dueDate !== undefined) {
    const next = patch.dueDate || null;
    const prev = before.due_date ? String(before.due_date).slice(0, 10) : null;
    if (String(next || '') !== String(prev || '')) {
      sets.push('due_date = ?'); params.push(next);
      events.push({ kind: 'status', body: next ? `Due date set to ${fmtDay(next)}` : 'Due date cleared' });
      changed.dueDate = next;
    }
  }

  if (!sets.length) return { ticket: before, before, changed: {}, events: [] };

  sets.push('updated_at = NOW()');
  // The row update and its trail entries must land together — a failure
  // between them used to be able to leave a ticket changed with no matching
  // event explaining who/why.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`UPDATE help_tickets SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    for (const e of events) await addEvent({ conn, ticketId: id, actorId, kind: e.kind, body: e.body });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const after = await getTicketRow(id);
  return { ticket: after, before, changed, events };
}

export async function addComment(ticketId, actorId, body) {
  await ensureSchema();
  await addEvent({ ticketId, actorId, kind: 'comment', body });
  // A comment is activity on the ticket; keep updated_at honest.
  await pool.query('UPDATE help_tickets SET updated_at = NOW() WHERE id = ?', [ticketId]);
}

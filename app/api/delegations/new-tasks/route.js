import { NextResponse } from 'next/server';
import { pool, USE_SHEETS } from '@/lib/db';
import { currentUser } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';

// Poll endpoint behind the voice alert (app/components/NewTaskVoiceAlert.jsx).
//
// The browser keeps an opaque `cursor` — the stamp of the newest task it has
// already announced — and hands it back on every poll. Anything newer is a
// task the user has not been told about yet. Because the cursor is a value the
// server issued, no clock has to agree with any other clock.
//
// A missing/unreadable cursor is a first run: it hands back today's high-water
// mark and speaks only for the last minute, so signing in never replays the
// whole backlog but a task handed over seconds ago is not lost either.

export const dynamic = 'force-dynamic';

const str = (v) => (v == null ? '' : String(v));

// How far back a first-ever poll will still speak up for. See the `floor`
// below: long enough to cover "task created, then the page opened", short
// enough that it can never read out yesterday's work.
const BASELINE_GRACE_MS = 60000;

/**
 * How new a row is, as epoch milliseconds.
 *
 * `created_at` alone is not enough to lean on. In Sheets mode every delegation
 * carried over from the old JSON store has an EMPTY created_at (verified
 * against the live sheet), a spreadsheet can hand a datetime cell back in
 * whatever format it is displayed in, and a bare "YYYY-MM-DD HH:MM:SS" parses
 * as local time even though it was written as UTC.
 *
 * The row id survives all of that: newId() is `DEL` + Date.now() in base36
 * (lib/ids.js), so the creation instant is readable straight off the primary
 * key. Legacy ids (DEL001…) decode to a few milliseconds past the epoch, which
 * is exactly the right answer — they are old. Taking the larger of the two
 * readings means a timezone-shifted created_at can only ever be ignored, never
 * make a new task look old.
 */
function stampOf(row) {
  const id = str(row.id).toUpperCase();
  let fromId = 0;
  // newId() is <prefix><8 base36 ms><2 worker><3 seq>, so the clock reading is
  // measured from the END of the id. Anchoring on the front instead does not
  // work: base36 digits are letters too, and a greedy prefix match happily eats
  // the first character of the timestamp ("DELM9X4…" — prefix or clock?).
  if (id.length >= 14) {
    const tail = id.slice(-13, -5);
    if (/^[0-9A-Z]{8}$/.test(tail)) {
      const n = parseInt(tail, 36);
      // Sanity window (2020…2100) so a legacy id that happens to be the right
      // width cannot decode to a date in the far future and mute every task
      // after it.
      if (n > 1577836800000 && n < 4102444800000) fromId = n;
    }
  }
  if (!fromId) {
    const digits = id.replace(/\D/g, '');
    if (digits) fromId = Number(digits) || 0;      // DEL011 -> 11ms past the epoch
  }
  // Only the MySQL/Sheets "YYYY-MM-DD HH:MM:SS" shape wants the T inserted;
  // forcing it on a spreadsheet's display format ("8/25/2026 10:57:39") turns a
  // parseable date into NaN.
  const when = str(row.createdAt).trim();
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(when) ? when.replace(' ', 'T') : when);
  const fromDate = Number.isFinite(parsed) ? parsed : 0;
  return Math.max(fromId, fromDate);
}

// The poll must never be answered from a cache — a repeat of the same `since`
// is exactly what a stale edge copy would pin forever.
const json = (body) => NextResponse.json(body, { headers: { 'Cache-Control': 'no-store, max-age=0' } });

export async function GET(req) {
  // Deliberately not requireUser(): a polling widget must never turn a signed
  // out (or suspended) session into a console full of 401s. It just goes quiet.
  const user = await currentUser();
  if (!user?.id) return json({ tasks: [], cursor: null, signedIn: false });

  const url = new URL(req.url);
  const raw = str(url.searchParams.get('since')).trim();
  const since = /^\d+$/.test(raw) ? Number(raw) : null;
  const debug = url.searchParams.get('debug') === '1';
  // An admin debugging someone else's silent alert can ask for their view with
  // &as=<userId>, instead of having to sign in as them. It reveals no task an
  // admin cannot already read on /all-tasks.
  const asId = debug && isAdminRoles(user.roles) ? str(url.searchParams.get('as')).trim() : '';
  const target = asId ? { id: asId, name: '', roles: [] } : user;

  try {
    const rows = (await recentForDoer(String(target.id)))
      .map((r) => ({ ...r, stamp: stampOf(r) }))
      .sort((a, b) => b.stamp - a.stamp);

    const cursor = String(rows[0]?.stamp ?? Date.now());

    // ?debug=1 — open it in the browser when the alert stays silent. It shows
    // which user the server thinks you are, which store it is reading, and how
    // each of your rows dates itself, which is every input the decision uses.
    // Scoped to the caller's own tasks (plus a system-wide peek for an admin,
    // who can already read every task through /all-tasks).
    if (debug) return json(await diagnose({ user, target, rows, cursor, since, raw }));

    // No cursor yet — a fresh browser, or the first tab opened today. It must
    // not replay the backlog, but going completely silent is wrong too: it
    // means a task handed to you seconds before you opened the page is lost,
    // and it makes the feature look broken when someone tests it by creating
    // the task first and opening the page second. Announce only the last
    // minute; the cursor is stored either way, so this can happen once.
    const floor = since === null ? Date.now() - BASELINE_GRACE_MS : since;

    const fresh = rows.filter((r) => r.stamp > floor);
    if (!fresh.length) return json({ tasks: [], cursor });

    const names = await namesById([...new Set(fresh.map((r) => str(r.delegatedBy)).filter(Boolean))]);

    return json({
      cursor,
      tasks: fresh.slice(0, 5).map((r) => ({
        id: r.id,
        description: str(r.description),
        by: names[str(r.delegatedBy)] || '',
        priority: str(r.priority),
        dueDate: str(r.dueDate).slice(0, 10),
      })),
    });
  } catch (err) {
    console.error('[new-tasks]', err.message);
    return json({ tasks: [], cursor: raw || null, error: err.message });
  }
}

// Newest handful of tasks assigned to this user.
//
// Ordered by id rather than created_at, because the id is the one column that
// cannot be blank and cannot be misread: newId() writes the clock into it
// (lib/ids.js), so id DESC *is* newest-first. Ordering by created_at instead
// sorts NULLs last in MySQL, which would drop a row with no timestamp out of
// the LIMIT window entirely — the newest task, silently invisible.
async function recentForDoer(userId) {
  const [rows] = await pool.query(
    `SELECT id, description, delegated_by AS delegatedBy, priority,
            due_date AS dueDate, created_at AS createdAt
       FROM delegations
      WHERE doer_id = ?
      ORDER BY id DESC
      LIMIT 50`,
    [userId]
  );
  return rows;
}

async function namesById(ids) {
  const out = {};
  if (!ids.length) return out;
  try {
    for (const id of ids) {
      const [rows] = await pool.query('SELECT name FROM users WHERE id = ?', [id]);
      if (rows[0]?.name) out[id] = rows[0].name;
    }
  } catch { /* a missing name only costs the announcement its "by X" clause */ }
  return out;
}

/**
 * ?debug=1 — everything the announce/stay-quiet decision is made from, in one
 * page. Written because the failure it diagnoses is invisible from the outside:
 * the alert simply stays silent, and silence looks the same whether the row was
 * never assigned to you, the store dates it strangely, or the cursor is already
 * past it.
 */
async function diagnose({ user, target, rows, cursor, since, raw }) {
  const admin = isAdminRoles(user.roles);
  const show = (r) => ({
    id: r.id,
    createdAt: str(r.createdAt) || '(empty)',
    stamp: r.stamp ?? stampOf(r),
    dated: new Date(r.stamp ?? stampOf(r)).toISOString(),
    newerThanCursor: since === null ? null : (r.stamp ?? stampOf(r)) > since,
  });

  const out = {
    serverTime: new Date().toISOString(),
    store: USE_SHEETS ? 'google-sheets' : 'mysql',
    youAre: { id: String(user.id), name: user.name || '', admin },
    viewOf: String(target.id) === String(user.id) ? '(yourself)' : `?as=${target.id}`,
    cursor: { received: raw || '(none — this poll only sets a baseline)', parsed: since, issuedBack: cursor },
    yourTasks: { matched: rows.length, newest: rows.slice(0, 5).map(show) },
    wouldAnnounceNow: rows.filter((r) => r.stamp > (since === null ? Date.now() - BASELINE_GRACE_MS : since)).length,
  };

  // An admin already sees every task on /all-tasks, so this adds no access —
  // it answers "did the task I just created land, and whose id is on it?".
  if (admin) {
    try {
      const [all] = await pool.query(
        `SELECT id, doer_id AS doerId, doer, delegated_by AS delegatedBy, created_at AS createdAt
           FROM delegations ORDER BY id DESC LIMIT 50`
      );
      out.newestInSystem = all
        .map((r) => ({ ...r, stamp: stampOf(r) }))
        .sort((a, b) => b.stamp - a.stamp)
        .slice(0, 5)
        .map((r) => ({ ...show(r), doerId: r.doerId, doer: r.doer, assignedToYou: String(r.doerId ?? '') === String(user.id) }));
      out.totalRowsScanned = all.length;
    } catch (e) { out.newestInSystem = `failed: ${e.message}`; }
  }
  return out;
}

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { readStore } from '@/lib/store';
import { currentUser } from '@/lib/api';

// Poll endpoint behind the voice alert (app/components/NewTaskVoiceAlert.jsx).
//
// The browser keeps an opaque `cursor` — the created_at of the newest task it
// has already announced — and hands it back on every poll. Anything newer than
// that is a task the user has not been told about yet. Comparing against a
// cursor the server itself issued keeps this free of clock skew between the
// browser, Node and the database, and works the same whether the store is
// MySQL, the Sheets SQL engine or the JSON file.
//
// A missing/empty cursor is a first run: it hands back today's high-water mark
// and announces nothing, so signing in never replays the whole backlog aloud.

export const dynamic = 'force-dynamic';

// Sentinel so "no tasks at all yet" still stores a truthy cursor — otherwise
// the very first task a brand-new user is given would be swallowed as a
// baseline instead of announced.
const EPOCH = '1970-01-01 00:00:00';

const str = (v) => (v == null ? '' : String(v));

export async function GET(req) {
  // Deliberately not requireUser(): a polling widget must never turn a signed
  // out (or suspended) session into a console full of 401s. It just goes quiet.
  const user = await currentUser();
  if (!user?.id) return NextResponse.json({ tasks: [], cursor: null });

  const since = str(new URL(req.url).searchParams.get('since')).trim();
  const me = String(user.id);

  try {
    const rows = await recentForDoer(me, user.name);
    const cursor = str(rows[0]?.createdAt) || (since || EPOCH);
    if (!since) return NextResponse.json({ tasks: [], cursor });

    const fresh = rows.filter((r) =>
      str(r.createdAt) > since &&
      // Delegating to yourself shouldn't announce itself back at you.
      String(r.delegatedBy ?? '') !== me
    );
    if (!fresh.length) return NextResponse.json({ tasks: [], cursor });

    const names = await namesById([...new Set(fresh.map((r) => str(r.delegatedBy)).filter(Boolean))]);

    return NextResponse.json({
      cursor,
      tasks: fresh.map((r) => ({
        id: r.id,
        description: str(r.description),
        by: names[str(r.delegatedBy)] || '',
        priority: str(r.priority),
        dueDate: str(r.dueDate).slice(0, 10),
      })),
    });
  } catch (err) {
    console.error('[new-tasks]', err.message);
    return NextResponse.json({ tasks: [], cursor: since || null });
  }
}

const hasDB = !!process.env.DB_HOST;

// Newest handful of tasks assigned to this user. 20 is well past what anyone
// can be handed between two 25s polls, and keeps the query cheap enough to run
// on every open tab.
async function recentForDoer(userId, userName) {
  if (hasDB) {
    const [rows] = await pool.query(
      `SELECT id, description, delegated_by AS delegatedBy, priority,
              due_date AS dueDate, created_at AS createdAt
         FROM delegations
        WHERE doer_id = ?
        ORDER BY created_at DESC
        LIMIT 20`,
      [userId]
    );
    return rows;
  }
  const store = await readStore();
  return (store.delegations || [])
    .filter((d) => String(d.doerId ?? '') === String(userId) || (!d.doerId && d.doer && d.doer === userName))
    .map((d) => ({
      id: d.id,
      description: d.description,
      delegatedBy: d.delegatedBy,
      priority: d.priority,
      dueDate: d.dueDate,
      createdAt: d.createdAt || d.created_at,
    }))
    .sort((a, b) => str(b.createdAt).localeCompare(str(a.createdAt)))
    .slice(0, 20);
}

async function namesById(ids) {
  const out = {};
  if (!ids.length) return out;
  try {
    if (hasDB) {
      for (const id of ids) {
        const [rows] = await pool.query('SELECT name FROM users WHERE id = ?', [id]);
        if (rows[0]?.name) out[id] = rows[0].name;
      }
      return out;
    }
    const store = await readStore();
    for (const u of store.users || []) {
      if (ids.includes(String(u.id))) out[String(u.id)] = u.name;
    }
  } catch { /* a missing name only costs the announcement its "by X" clause */ }
  return out;
}

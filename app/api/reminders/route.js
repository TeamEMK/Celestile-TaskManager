import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, reminderMessage, checklistReminderMessage, fmsReminderMessage, isWhatsappConfigured } from '@/lib/whatsapp';
import { getFmsPendingGroupedByDoer } from '@/lib/fmsSheet';

// UTC date helpers (match the engine's CURDATE())
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
function weekStartStr() {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export const dynamic = 'force-dynamic';

// Allowed if called by Vercel Cron (Authorization: Bearer CRON_SECRET) or
// manually with ?secret=<DEVELOPER_SECRET> for testing.
function authorized(req) {
  const bearer = req.headers.get('authorization');
  if (process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return true;
  const secret = new URL(req.url).searchParams.get('secret');
  if (secret && secret === process.env.DEVELOPER_SECRET) return true;
  return false;
}

// Send a WhatsApp reminder for every OVERDUE, not-yet-done delegation
// (one message per task) to the doer's phone. Wired to a daily Vercel Cron.
export async function GET(req) {
  if (!authorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isWhatsappConfigured())
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });

  await ensureSchema();
  const [dels]  = await pool.query("SELECT * FROM delegations WHERE status != 'done' AND due_date < CURDATE()");
  const [users] = await pool.query('SELECT id, name, phone FROM users');
  const byId = {};
  users.forEach((u) => { byId[u.id] = u; });

  const results = [];
  for (const d of dels) {
    if (!d.due_date) continue;                 // guard: skip rows with no due date
    const u = byId[d.doer_id];
    const phone = u?.phone;
    if (!phone) { results.push({ id: d.id, skipped: 'no phone' }); continue; }
    const msg = reminderMessage({
      name: u?.name || d.doer,
      id: d.id,
      description: d.description,
      dueDate: d.due_date,
      priority: d.priority,
      client: d.client,
    });
    const r = await sendWhatsApp(phone, msg);
    results.push({ id: d.id, to: phone, ok: !!r.ok, reason: r.reason || r.error });
  }

  // ── Checklist reminders (grouped per user, pending by frequency) ──────────
  const [masters] = await pool.query('SELECT * FROM masters');
  const [comps]   = await pool.query('SELECT master_id, date FROM checklist_completions');
  const today = todayStr();
  const weekStart = weekStartStr();
  const month = today.slice(0, 7);

  const compByMaster = {};
  comps.forEach((c) => {
    const d = String(c.date || '').slice(0, 10);
    (compByMaster[c.master_id] = compByMaster[c.master_id] || []).push(d);
  });

  const isPending = (m) => {
    const dates = compByMaster[m.id] || [];
    const f = String(m.frequency || '').toLowerCase();
    if (f.startsWith('w')) return !dates.some((d) => d >= weekStart);
    if (f.startsWith('m')) return !dates.some((d) => d.slice(0, 7) === month);
    return !dates.includes(today); // daily (default)
  };

  const usersByName = {};
  users.forEach((u) => { usersByName[String(u.name || '').toLowerCase()] = u; });

  const grouped = {}; // userId -> { user, tasks: [] }
  for (const m of masters) {
    if (!isPending(m)) continue;
    const u = usersByName[String(m.assigned_to || '').toLowerCase()];
    if (!u || !u.phone) continue; // skip group/unknown assignees without a phone
    (grouped[u.id] = grouped[u.id] || { user: u, tasks: [] }).tasks.push(m);
  }

  const checklistResults = [];
  for (const { user, tasks } of Object.values(grouped)) {
    const msg = checklistReminderMessage(user.name, tasks.map((m) => ({
      id: m.id, task: m.task, targetDate: m.start_date || today, client: '', frequency: m.frequency,
    })));
    const r = await sendWhatsApp(user.phone, msg);
    checklistResults.push({ to: user.phone, tasks: tasks.length, ok: !!r.ok });
  }

  // ── FMS reminders (grouped per user, pending steps from live sheets) ─────
  const fmsResults = [];
  try {
    const byDoer = await getFmsPendingGroupedByDoer();
    for (const [name, tasks] of Object.entries(byDoer)) {
      const u = usersByName[name.toLowerCase()];
      if (!u || !u.phone) continue;
      const msg = fmsReminderMessage(u.name, tasks);
      const r = await sendWhatsApp(u.phone, msg);
      fmsResults.push({ to: u.phone, tasks: tasks.length, ok: !!r.ok });
    }
  } catch (err) {
    console.error('[reminders] FMS section failed', err.message);
  }

  return NextResponse.json({
    overdue: dels.length,
    sent: results.filter((r) => r.ok).length,
    results,
    checklist: { users: checklistResults.length, sent: checklistResults.filter((r) => r.ok).length, results: checklistResults },
    fms: { users: fmsResults.length, sent: fmsResults.filter((r) => r.ok).length, results: fmsResults },
  });
}

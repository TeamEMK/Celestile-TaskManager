import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, isWhatsappConfigured } from '@/lib/whatsapp';

function istDateStr() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

// Daily WhatsApp to each doer listing their open delegations that are due
// today or overdue — one message per person, not one per task. The overdue
// reminder used to live only in /api/reminders, which waited on a Vercel cron
// that never existed on Hostinger, so it never went out (18-11-2026). It now
// runs from the in-app scheduler (lib/scheduler.js).
//
// Open = anything not done and not waiting on an approver (that one is the
// approver's to act on, and they get their own notice when it lands).

const SENT_KEY = 'delegation_reminder_sent';
const CLOSED = new Set(['done', 'approval_pending']);

function isoDate(v) {
  if (!v) return '';
  if (v instanceof Date) return Number.isNaN(+v) ? '' : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

const ddmm = (iso) => iso.split('-').reverse().join('/');

export function delegationReminderText(name, tasks, today) {
  const lines = tasks.map((t, i) => [
    `${i + 1}. ${t.description || '-'}`,
    `   Task ID - ${t.id}`,
    `   Target Date - ${ddmm(t.due)}${t.due < today ? ' ⚠️ Overdue' : ' (Today)'}`,
    `   Priority - ${t.priority || 'Low'}${t.client ? `\n   Client - ${t.client}` : ''}`,
  ].join('\n'));
  return [
    `*${name || 'Hello'} - Delegation Pending Task Summary*`,
    '',
    `You have ${tasks.length} pending task${tasks.length === 1 ? '' : 's'}:`,
    '',
    lines.join('\n\n'),
    '',
    'Please complete them on celestileoffice.com',
  ].join('\n');
}

export async function delegationRemindersSentToday() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [SENT_KEY]);
  return String(rows?.[0]?.value || '') === istDateStr();
}

export async function markDelegationRemindersSent() {
  const today = istDateStr();
  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?', [SENT_KEY, today, today]);
}

export async function sendDelegationReminders() {
  await ensureSchema();
  const today = istDateStr();
  const [dels] = await pool.query('SELECT * FROM delegations');
  const [users] = await pool.query('SELECT id, name, phone FROM users');
  const byId = new Map(users.map((u) => [String(u.id), u]));
  const byName = new Map(users.map((u) => [String(u.name || '').trim().toLowerCase(), u]));

  const groups = new Map(); // user id -> { user, tasks }
  for (const d of dels || []) {
    if (CLOSED.has(String(d.status || '').trim().toLowerCase())) continue;
    const due = isoDate(d.due_date);
    if (!due || due > today) continue;
    const u = byId.get(String(d.doer_id ?? '')) || byName.get(String(d.doer || '').trim().toLowerCase());
    const key = u ? String(u.id) : `name:${d.doer}`;
    if (!groups.has(key)) groups.set(key, { user: u, name: u?.name || d.doer, tasks: [] });
    groups.get(key).tasks.push({ id: d.id, description: d.description, due, priority: d.priority, client: d.client });
  }

  const results = [];
  for (const { user, name, tasks } of groups.values()) {
    tasks.sort((a, b) => a.due.localeCompare(b.due));
    if (!user?.phone) { results.push({ name, tasks: tasks.length, skipped: 'no phone' }); continue; }
    if (!isWhatsappConfigured()) { results.push({ name, tasks: tasks.length, skipped: 'whatsapp not configured' }); continue; }
    const r = await sendWhatsApp(user.phone, delegationReminderText(name, tasks, today));
    results.push({ name, tasks: tasks.length, ok: !!r.ok, reason: r.reason || r.error || undefined });
  }
  return { people: results.length, sent: results.filter((r) => r.ok).length, results };
}

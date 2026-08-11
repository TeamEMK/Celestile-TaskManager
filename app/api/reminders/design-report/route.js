import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, designDailyReportMessage, designNotFilledMessage, isWhatsappConfigured } from '@/lib/whatsapp';
import { requireCron } from '@/lib/api';

// Where the design group's daily report lands. Same fallback pattern as
// INVENTORY_NOTIFY etc. — works out of the box, override via env if the
// group ever changes.
const DESIGN_GROUP = () => process.env.DESIGN_GROUP_ID || '918050005533-1568964481@g.us';

export const dynamic = 'force-dynamic';

// IST (UTC+5:30) day-of-week — the server may run in UTC, but "everyday
// except Sunday" means Sunday in India, not Sunday UTC.
function istDay() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).getUTCDay(); // 0 = Sunday
}
function istDateStr() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// Designer daily report — one WhatsApp message PER designer (not one
// rolled-up message for the whole department) into the design group, every
// day except Sunday at 8:30 PM IST. Wire an external cron (Hostinger cron
// job / cron-job.org / Vercel Cron) to hit this URL with
// `Authorization: Bearer <CRON_SECRET>` on schedule "30 20 * * 1-6" IST
// (= "0 15 * * 1-6" UTC).
export async function GET(req) {
  const gate = requireCron(req); if (gate) return gate;
  if (!isWhatsappConfigured())
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });

  if (istDay() === 0)
    return NextResponse.json({ ok: true, skipped: 'Sunday' });

  await ensureSchema();
  const today = istDateStr();
  // Plain `SELECT *`, then filter in JS: with Google Sheets as the database
  // the SQL engine (lib/sql-sheets.js) supports neither DATE(col) nor LIKE,
  // so the old `WHERE DATE(entry_date) = ? AND LOWER(department) LIKE …`
  // threw before a single message went out. daily_tasks is a small table.
  const [all] = await pool.query('SELECT * FROM daily_tasks');
  const rows = (all || [])
    .filter((r) => String(r.entry_date || '').slice(0, 10) === today
      && String(r.department || '').toLowerCase().includes('design'))
    .sort((a, b) => String(a.doer || '').localeCompare(String(b.doer || ''))
      || String(a.created_at || '').localeCompare(String(b.created_at || '')));

  // Group today's rows by designer — each row becomes one numbered client
  // block in that designer's message.
  const byDoer = {};
  for (const r of rows) {
    const name = (r.doer || '').trim();
    if (!name) continue;
    (byDoer[name] = byDoer[name] || []).push({
      client: r.client, clientNumber: r.client_number, orderNumber: r.order_number,
      areaName: r.area_name, minutes: r.minutes, software: r.software,
    });
  }

  const results = [];
  for (const [name, tasks] of Object.entries(byDoer)) {
    const msg = designDailyReportMessage(name, tasks);
    const r = await sendWhatsApp(DESIGN_GROUP(), msg);
    results.push({ designer: name, tasks: tasks.length, ok: !!r.ok, reason: r.reason || r.error });
  }

  // Designers who haven't filled anything today get their own separate
  // "not filled" message — same group, but its own message per person
  // rather than folded into the report above.
  const [designUsers] = await pool.query('SELECT name, department FROM users');
  const filled = new Set(Object.keys(byDoer).map((n) => n.toLowerCase()));
  const notFilledResults = [];
  for (const u of designUsers) {
    const dept = (u.department || '').toLowerCase();
    if (!dept.includes('design')) continue;
    const name = (u.name || '').trim();
    if (!name || filled.has(name.toLowerCase())) continue;
    const r = await sendWhatsApp(DESIGN_GROUP(), designNotFilledMessage(name));
    notFilledResults.push({ designer: name, ok: !!r.ok, reason: r.reason || r.error });
  }

  return NextResponse.json({
    date: today,
    designers: results.length, sent: results.filter((r) => r.ok).length, results,
    notFilled: notFilledResults.length, notFilledSent: notFilledResults.filter((r) => r.ok).length, notFilledResults,
  });
}

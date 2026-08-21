import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import {
  sendWhatsApp, isWhatsappConfigured, dailyReportNotFilledMessage,
  designDailyReportMessage, salesDailyReportMessage, siteDailyReportMessage,
} from '@/lib/whatsapp';
import { requireCron } from '@/lib/api';

// Shared engine behind the daily-report cron routes (designer, sales, site
// engineer). Each of those is the same job with a different WhatsApp group,
// a different set of departments and a different message layout: one message
// PER person into that department's group, every day except Sunday, plus a
// separate "not filled" message for anyone who skipped today.
//
// The schedule itself lives in the cron provider, not here — these routes
// only refuse to run on a Sunday.

// IST (UTC+5:30) day-of-week — the server may run in UTC, but "everyday
// except Sunday" means Sunday in India, not Sunday UTC.
export function istDay() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).getUTCDay(); // 0 = Sunday
}
export function istDateStr() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// Both the daily_tasks rows and the users list are matched the same way: an
// exact hit on one of the department names the user form offers, or the
// keyword anywhere in the value. That is what keeps a "Sales Person" user
// and a row saved as "Sales" in the same report, without sweeping HR /
// Accounts / Management into any of them.
export function deptMatcher(names, keyword) {
  const list = names.map((n) => n.toLowerCase());
  return (value) => {
    const d = String(value || '').toLowerCase().trim();
    if (!d) return false;
    return list.includes(d) || d.includes(keyword);
  };
}

// The three reports, keyed by the name their route uses. Group JIDs are read
// lazily so an env change lands without a rebuild; the fallbacks are the
// groups actually in use today (same pattern as INVENTORY_NOTIFY).
// The department lists mirror deptToFormType() in
// app/daily-task/DailyTaskClient.jsx — whoever fills a form is whoever shows
// up in that form's report.
export const REPORTS = {
  design: {
    label: 'design',
    group: () => process.env.DESIGN_GROUP_ID || '918050005533-1568964481@g.us',
    matches: deptMatcher(['designer', 'design'], 'design'),
    buildMessage: designDailyReportMessage,
  },
  sales: {
    label: 'sales',
    group: () => process.env.SALES_GROUP_ID || '120363423282772712@g.us',
    matches: deptMatcher(
      ['sales', 'sales person', 'crm', 'client relationship manager'], 'sales'),
    buildMessage: salesDailyReportMessage,
  },
  site: {
    label: 'site',
    group: () => process.env.SITE_GROUP_ID || '918008000033-1632923065@g.us',
    matches: deptMatcher(
      ['site engineer', 'sc', 'runner', 'process coordinator', 'pc'], 'site engineer'),
    buildMessage: siteDailyReportMessage,
  },
};

// Every column a report message might want, in the camelCase the message
// builders in lib/whatsapp.js use.
function toEntry(r) {
  return {
    client: r.client, clientNumber: r.client_number, orderNumber: r.order_number,
    areaName: r.area_name, taskType: r.task_type, description: r.description,
    software: r.software, revision: r.revision,
    siteLocation: r.site_location, purposeOfVisit: r.purpose_of_visit,
    checksType: r.checks_type, kmsTravelled: r.kms_travelled,
    minutes: r.minutes, branch: r.branch,
  };
}

// Reads today's rows once and sends one report. Returns plain data (no
// Response) so the combined route can run all three off a single request.
export async function sendDailyReport({ label, group, matches, buildMessage }, rows, users) {
  const to = group();
  const today = istDateStr();

  const mine = rows
    .filter((r) => matches(r.department))
    .sort((a, b) => String(a.doer || '').localeCompare(String(b.doer || ''))
      || String(a.created_at || '').localeCompare(String(b.created_at || '')));

  // Group today's rows by person — each row becomes one numbered client
  // block in that person's message.
  const byDoer = {};
  for (const r of mine) {
    const name = (r.doer || '').trim();
    if (!name) continue;
    (byDoer[name] = byDoer[name] || []).push(toEntry(r));
  }

  const results = [];
  for (const [name, tasks] of Object.entries(byDoer)) {
    const r = await sendWhatsApp(to, buildMessage(name, tasks));
    results.push({ name, tasks: tasks.length, ok: !!r.ok, reason: r.reason || r.error });
  }

  // Anyone in the department who has not filled anything today gets their own
  // separate "not filled" message — same group, but its own message per
  // person rather than folded into the report above.
  const filled = new Set(Object.keys(byDoer).map((n) => n.toLowerCase()));
  const notFilledResults = [];
  for (const u of users) {
    if (!matches(u.department)) continue;
    const name = (u.name || '').trim();
    if (!name || filled.has(name.toLowerCase())) continue;
    const r = await sendWhatsApp(to, dailyReportNotFilledMessage(name));
    notFilledResults.push({ name, ok: !!r.ok, reason: r.reason || r.error });
  }

  return {
    report: label, date: today, group: to,
    people: results.length, sent: results.filter((r) => r.ok).length, results,
    notFilled: notFilledResults.length,
    notFilledSent: notFilledResults.filter((r) => r.ok).length, notFilledResults,
  };
}

// Today's daily_tasks rows plus the user list — fetched once and shared by
// however many reports a request runs.
//
// Plain `SELECT *`, then filter in JS: with Google Sheets as the database the
// SQL engine (lib/sql-sheets.js) supports neither DATE(col) nor LIKE, so a
// `WHERE DATE(entry_date) = ? AND LOWER(department) LIKE ...` throws before a
// single message goes out. daily_tasks is a small table.
async function loadToday() {
  await ensureSchema();
  const today = istDateStr();
  const [all] = await pool.query('SELECT * FROM daily_tasks');
  const rows = (all || []).filter((r) => String(r.entry_date || '').slice(0, 10) === today);
  const [users] = await pool.query('SELECT name, department FROM users');
  return { rows, users: users || [] };
}

// Cron entry point. Pass one config for a single team's report, or several to
// send them all off one cron hit.
export async function runDailyReport(req, configs) {
  const list = Array.isArray(configs) ? configs : [configs];

  const gate = requireCron(req); if (gate) return gate;
  if (!isWhatsappConfigured())
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });

  if (istDay() === 0)
    return NextResponse.json({ ok: true, skipped: 'Sunday' });

  const { rows, users } = await loadToday();
  const reports = [];
  for (const cfg of list) reports.push(await sendDailyReport(cfg, rows, users));

  // A single-report route keeps its original flat response shape.
  return NextResponse.json(reports.length === 1
    ? reports[0]
    : { date: istDateStr(), reports });
}

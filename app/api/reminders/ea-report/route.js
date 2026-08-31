import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, isWhatsappConfigured, eaDailyReportMessage } from '@/lib/whatsapp';
import { requireCron } from '@/lib/api';
import { istDay, istDateStr, toEntry } from '@/lib/dailyReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Executive Assistant evening report: today's Walk-in + Payments entries in
// ONE combined WhatsApp message to EA_REPORT_NOTIFY (Vinay sir — a plain
// number or a group JID). Unlike the team reports this is a management
// summary, so it is one message for the whole day, not one per person, and
// it goes out even when nothing was filled (so a silent day is visible).
//
// Schedule in the external cron provider at 7:00 PM IST, Mon–Sat:
//   "0 19 * * 1-6" IST  (= "30 13 * * 1-6" UTC)
// Same auth as the other reminder routes: Authorization: Bearer <CRON_SECRET>
// (or ?secret=<DEVELOPER_SECRET> for manual testing).
export async function GET(req) {
  const gate = requireCron(req); if (gate) return gate;
  if (!isWhatsappConfigured())
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });
  if (istDay() === 0)
    return NextResponse.json({ ok: true, skipped: 'Sunday' });

  // No fallback recipient on purpose — better no message than the wrong chat.
  const to = process.env.EA_REPORT_NOTIFY || '';
  if (!to)
    return NextResponse.json({ ok: false, skipped: 'EA_REPORT_NOTIFY not configured' });

  await ensureSchema();
  const today = istDateStr();
  // Plain SELECT + JS filter, same reason as lib/dailyReport.js loadToday():
  // the Sheets SQL engine supports neither DATE(col) nor LIKE.
  const [all] = await pool.query('SELECT * FROM daily_tasks');
  const rows = (all || []).filter((r) => String(r.entry_date || '').slice(0, 10) === today);
  const walkins  = rows.filter((r) => r.department === 'Walk-in').map(toEntry);
  const payments = rows.filter((r) => r.department === 'Sales Payment').map(toEntry);

  const r = await sendWhatsApp(to, eaDailyReportMessage(today, walkins, payments));
  return NextResponse.json({
    ok: !!r.ok, date: today, to,
    walkins: walkins.length, payments: payments.length,
    ...(r.reason || r.error ? { reason: r.reason || r.error } : {}),
  });
}

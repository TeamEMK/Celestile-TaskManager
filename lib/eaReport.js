import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, sendWhatsAppDocument, isWhatsappConfigured, eaDailyReportMessage } from '@/lib/whatsapp';
import { istDay, istDateStr, toEntry, salesMonthSummary, eaReportSig } from '@/lib/dailyReport';

// Executive Assistant evening report: today's Walk-in + Payments entries in
// ONE combined WhatsApp message to EA_REPORT_NOTIFY (Vinay sir — a plain
// number or a group JID). Unlike the team reports this is a management
// summary, so it is one message for the whole day, not one per person, and
// it goes out even when nothing was filled (so a silent day is visible).
//
// Two things can trigger it: the in-app scheduler (lib/scheduler.js, 7 PM
// IST Mon–Sat, no host cron needed) and the /api/reminders/ea-report route
// for a manual run or an external cron. Both land here.
export const EA_REPORT_SENT_KEY = 'ea_report_sent';

export function eaReportRecipient() {
  return process.env.EA_REPORT_NOTIFY || '918008000033';
}

export async function sendEaReport() {
  if (!isWhatsappConfigured()) return { ok: false, error: 'WhatsApp not configured' };
  if (istDay() === 0) return { ok: true, skipped: 'Sunday' };

  const to = eaReportRecipient();
  await ensureSchema();
  const today = istDateStr();
  // Plain SELECT + JS filter, same reason as lib/dailyReport.js loadToday():
  // the Sheets SQL engine supports neither DATE(col) nor LIKE.
  const [all] = await pool.query('SELECT * FROM daily_tasks');
  const rows = (all || []).filter((r) => String(r.entry_date || '').slice(0, 10) === today);
  const walkins  = rows.filter((r) => r.department === 'Walk-in').map(toEntry);
  const payments = rows.filter((r) => r.department === 'Sales Payment').map(toEntry);

  // Month position under the payments: received so far (computed) vs the
  // monthly target set on the Payments form (app_config sales_target_<month>).
  const sales = await salesMonthSummary();

  const r = await sendWhatsApp(to, eaDailyReportMessage(today, walkins, payments, sales));

  // Excel-style PDF of the same report, attached as a document. Maytapi
  // fetches the URL itself, so it carries an HMAC signature instead of auth.
  const baseUrl = process.env.NEXTAUTH_URL || 'https://celestileoffice.com';
  const pdfUrl = `${baseUrl}/api/ea-report-pdf?date=${today}&sig=${eaReportSig(today)}`;
  const d = await sendWhatsAppDocument(to, pdfUrl, `Daily-Report-${today}.pdf`,
    `📄 Daily Report — ${today}`);

  // Remember the day it went out so a restart (or the second PM2 instance)
  // cannot send it twice. Written after the send: a failed send stays
  // retryable on the next scheduler tick.
  if (r.ok) {
    await pool.query(
      'INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      [EA_REPORT_SENT_KEY, today, today]).catch((e) => console.error('[eaReport] mark sent:', e.message));
  }

  return {
    ok: !!r.ok, pdfOk: !!d.ok, date: today, to,
    walkins: walkins.length, payments: payments.length,
    ...(r.reason || r.error ? { reason: r.reason || r.error } : {}),
    ...(d.reason || d.error ? { pdfReason: d.reason || d.error } : {}),
  };
}

// Has today's report already gone out (from any process)?
export async function eaReportSentToday() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [EA_REPORT_SENT_KEY]);
  return String(rows?.[0]?.value || '') === istDateStr();
}

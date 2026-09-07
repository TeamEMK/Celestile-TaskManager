import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsAppDocument, isWhatsappConfigured } from '@/lib/whatsapp';
import { istDay, istDateStr, toEntry, eaReportSig } from '@/lib/dailyReport';

// Executive Assistant evening report: today's Walk-in + Payments entries as
// ONE PDF document to EA_REPORT_NOTIFY (Vinay sir — a plain number or a group
// JID). Only the PDF goes out — no text summary alongside it (that was asked
// to be dropped on 2026-09-07: the PDF is the report). Unlike the team
// reports this is a management summary, so it is one document for the whole
// day, not one per person, and it goes out even when nothing was filled (so
// a silent day is visible).
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

  // Excel-style PDF of the report (walk-ins, payments, month position — the
  // /api/ea-report-pdf route re-reads the same rows), sent as a document.
  // Maytapi fetches the URL itself, so it carries an HMAC signature instead
  // of auth. No caption: the file name already says what and which day.
  const baseUrl = process.env.NEXTAUTH_URL || 'https://celestileoffice.com';
  const pdfUrl = `${baseUrl}/api/ea-report-pdf?date=${today}&sig=${eaReportSig(today)}`;
  const d = await sendWhatsAppDocument(to, pdfUrl, `Daily-Report-${today}.pdf`, '');

  // Remember the day it went out so a restart (or the second PM2 instance)
  // cannot send it twice. Written after the send: a failed send stays
  // retryable on the next scheduler tick.
  if (d.ok) {
    await pool.query(
      'INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      [EA_REPORT_SENT_KEY, today, today]).catch((e) => console.error('[eaReport] mark sent:', e.message));
  }

  return {
    ok: !!d.ok, date: today, to,
    walkins: walkins.length, payments: payments.length,
    ...(d.reason || d.error ? { reason: d.reason || d.error } : {}),
  };
}

// Has today's report already gone out (from any process)?
export async function eaReportSentToday() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [EA_REPORT_SENT_KEY]);
  return String(rows?.[0]?.value || '') === istDateStr();
}

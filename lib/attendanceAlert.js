/**
 * Factory attendance reminder (Vivek sir, 13-11-2026 meeting): "agar 12 baje
 * tak fill na ho to alert aana chahiye".
 *
 * At ATTENDANCE_ALERT_TIME (default 12:00 IST, Mon–Sat — lib/scheduler.js)
 * every active Factory Attendance department that has no rows for today is
 * listed in one WhatsApp to the "Factory Attendance" group (FMS → QC Alerts →
 * WhatsApp Groups, or FACTORY_ATTENDANCE_GROUP_ID). A department with shifts
 * is checked on its Day shift only — the night shift can't be in by noon.
 * Nothing missing → nothing sent.
 */
import { pool, ensureSchema } from '@/lib/db';
import { getDayReport } from '@/lib/production';
import { getAlertGroups } from '@/lib/qcAlerts';
import { sendWhatsApp, isWhatsappConfigured } from '@/lib/whatsapp';
import { istDateStr } from '@/lib/dailyReport';

export const ATTENDANCE_GROUP = 'Factory Attendance';
const SENT_KEY = 'factory_attendance_alert_sent';

async function readConfig(key) {
  await ensureSchema();
  const [rows] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [key]);
  return rows?.[0]?.value ?? '';
}
async function writeConfig(key, value) {
  await pool.query(
    'INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [key, value, value]);
}

export async function attendanceAlertSentToday() {
  return (await readConfig(SENT_KEY)) === istDateStr();
}

// Departments still empty for `date` (YYYY-MM-DD). Pure over a day report,
// so it can be checked without a database.
export function missingDepartments(report) {
  const filled = new Set((report.entries || [])
    .filter((e) => (e.shift || '') === '' || e.shift === 'day')
    .map((e) => String(e.departmentId)));
  return (report.departments || [])
    .filter((d) => d.active !== false && !filled.has(String(d.id)))
    .map((d) => (d.hasShifts ? `${d.name} (Day Shift)` : d.name));
}

export function attendanceMessage(date, missing) {
  const [y, m, d] = date.split('-');
  return [
    `⏰ *Factory Attendance not filled* — ${d}-${m}-${y}, 12 PM`,
    '',
    ...missing.map((n, i) => `${i + 1}. ${n}`),
    '',
    'Please fill it in the Task Manager → Factory Attendance.',
  ].join('\n');
}

export async function sendAttendanceAlert() {
  const date = istDateStr();
  const missing = missingDepartments(await getDayReport(date));
  const done = async (r) => { await writeConfig(SENT_KEY, date); return r; };
  if (!missing.length) return done({ date, missing: 0 });
  if (!isWhatsappConfigured()) return done({ date, missing: missing.length, skipped: 'WhatsApp not configured' });
  const jid = (await getAlertGroups())[ATTENDANCE_GROUP];
  // Marked done either way: retrying every tick for an hour can't create a
  // group ID that isn't set.
  if (!jid) return done({ date, missing: missing.length, skipped: `group "${ATTENDANCE_GROUP}" has no ID` });
  const r = await sendWhatsApp(jid, attendanceMessage(date, missing));
  // A failed send is left unmarked so the next tick retries it.
  if (r && r.ok === false) return { date, missing: missing.length, sent: false };
  return done({ date, missing: missing.length, sent: true });
}

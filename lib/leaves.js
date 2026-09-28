/**
 * Leave Tracker — balances, quotas and department-wise approver routing.
 *
 * Routes (app/api/leaves/*) stay thin; the SQL and decision rules live here,
 * same split as lib/helpTickets.js.
 */
import { pool } from '@/lib/db';

export const LEAVE_TYPES = ['Leave', 'WFH', 'Extra Working'];

// Annual quota per type, in working days. 0 (or missing) means "not tracked" —
// applying never blocks on balance for that type. Admin-editable via
// /api/leaves/settings; these are only the out-of-the-box defaults.
export const DEFAULT_QUOTAS = { Leave: 12, WFH: 4, 'Extra Working': 0 };

const APPROVERS_KEY = 'leave_approvers'; // app_config: { [department]: userId }
const QUOTAS_KEY = 'leave_quotas';       // app_config: { [type]: annualDays }

async function readConfig(key) {
  const [rows] = await pool.query("SELECT `value` FROM app_config WHERE `key` = ?", [key]);
  if (!rows.length) return null;
  try { return JSON.parse(rows[0].value); } catch { return null; }
}
async function writeConfig(key, value) {
  await pool.query(
    "INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?",
    [key, JSON.stringify(value), JSON.stringify(value)]
  );
}

export async function readApprovers() {
  const v = await readConfig(APPROVERS_KEY);
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}
export async function saveApprovers(map) {
  await writeConfig(APPROVERS_KEY, map && typeof map === 'object' ? map : {});
}

export async function readQuotas() {
  const v = await readConfig(QUOTAS_KEY);
  return { ...DEFAULT_QUOTAS, ...((v && typeof v === 'object') ? v : {}) };
}
export async function saveQuotas(map) {
  const clean = {};
  for (const t of LEAVE_TYPES) {
    const n = Number(map?.[t]);
    clean[t] = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  await writeConfig(QUOTAS_KEY, clean);
}

// The department's routed approver — a specific Admin/HOD user id, set by an
// admin in Leave Tracker settings. Null if that department has none
// configured, which falls back to the old "any HOD/Admin may decide" rule.
export async function resolveApprover(department) {
  if (!department) return null;
  const approvers = await readApprovers();
  const id = approvers[department];
  if (!id) return null;
  const [rows] = await pool.query('SELECT id, name FROM users WHERE id = ?', [String(id)]);
  return rows[0] ? { id: rows[0].id, name: rows[0].name } : null;
}

// Same 'Admin' role always decides anything (existing app-wide convention).
// An 'HOD' only decides a leave routed to them specifically — unless that
// leave's department has no configured approver, in which case any HOD may,
// same as before routing existed.
export function canDecideLeave(row, userId, roles) {
  const list = roles || [];
  if (list.includes('Admin')) return true;
  if (list.includes('HOD')) {
    if (!row.approver_id) return true;
    return String(row.approver_id) === String(userId);
  }
  return false;
}

// One calendar day off. Weekend convention matches app/api/holidays/route.js
// (nextWorkingDay): only Sunday is a non-working day, plus whatever is in
// the holidays table.
export async function getHolidaySet() {
  const [rows] = await pool.query('SELECT date FROM holidays');
  return new Set(rows.map((r) => {
    const v = r.date;
    return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  }));
}

// Inclusive working-day count between two YYYY-MM-DD dates.
export function countLeaveDays(fromDate, toDate, holidaySet) {
  const from = String(fromDate || '').slice(0, 10);
  const to = String(toDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 0;
  let d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  let count = 0;
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && !(holidaySet && holidaySet.has(iso))) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

/**
 * Quota / used / remaining per leave type for one user in one calendar year.
 * "Used" only counts approved applications whose fromDate falls in that year
 * — a leave straddling New Year's is charged to the year it starts in.
 */
export async function getUserBalances(userId, year, precomputed = {}) {
  const quotas = precomputed.quotas || await readQuotas();
  const holidaySet = precomputed.holidaySet || await getHolidaySet();
  const [rows] = await pool.query(
    'SELECT type, from_date AS fromDate, to_date AS toDate, status FROM leaves WHERE user_id = ?',
    [String(userId)]
  );
  const y = String(year);
  const approved = rows.filter((r) => r.status === 'approved' && String(r.fromDate || '').slice(0, 4) === y);

  return LEAVE_TYPES.map((type) => {
    const quota = Number(quotas[type] || 0);
    const used = approved
      .filter((r) => r.type === type)
      .reduce((sum, r) => sum + countLeaveDays(r.fromDate, r.toDate, holidaySet), 0);
    return { type, quota, used, remaining: quota > 0 ? Math.max(0, quota - used) : null };
  });
}

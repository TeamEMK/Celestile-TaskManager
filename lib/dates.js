// One date vocabulary for the whole app. Before this, 19 per-page helpers
// produced FOUR different renderings of the same date (05-09-2026 on the
// dashboard, 05/09/2026 on approvals, browser-timezone-shifted on both), and
// eight todayISO copies used UTC — between midnight and 05:30 IST they
// returned *yesterday*.

// DD-MM-YYYY from a YYYY-MM-DD(-ish) value. Pure string slicing — the only
// timezone-safe treatment for date-only values (new Date() re-interprets them
// in the browser's zone and can shift the day).
export function fmtDMY(v) {
  if (!v) return '—';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(v);
}

// Today's date in IST, as YYYY-MM-DD (same arithmetic as istDateStr in
// lib/dailyReport.js — kept separate because that module is server-only).
export function todayISO() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// YYYY-MM-DD from a Date object (UTC calendar — for computed range endpoints).
export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

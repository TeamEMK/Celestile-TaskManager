// Bits the list and the detail view both need, so a status pill can't end up
// two different colours on two screens.
//
// The status/priority vocabularies are repeated here rather than imported from
// lib/helpTickets.js on purpose: that module pulls in lib/db.js (mysql2,
// googleapis) and must never reach the browser bundle. The server is still the
// one that validates them — see the PATCH route.
export const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
export const STATUS_LABELS = {
  open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed',
};
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const DONE_STATUSES = ['resolved', 'closed'];

export const STATUS_PILL = {
  open:        'bg-amber-50 text-amber-700 border border-amber-100',
  in_progress: 'bg-blue-50 text-blue-700 border border-blue-100',
  resolved:    'bg-emerald-50 text-emerald-700 border border-emerald-100',
  closed:      'bg-slate-100 text-slate-600 border border-slate-200',
};

export const PRIORITY_PILL = {
  High:   'bg-red-50 text-red-700 border border-red-100',
  Medium: 'bg-amber-50 text-amber-700 border border-amber-100',
  Low:    'bg-slate-100 text-slate-600 border border-slate-200',
};

// Stored timestamps are MySQL-style strings ("2026-08-20 09:15:00") written by
// NOW(), which lib/db.js treats as UTC — read them the same way here rather
// than letting the browser guess local time.
export function parseTs(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + (String(s).endsWith('Z') ? '' : 'Z'));
  return isNaN(d.getTime()) ? null : d;
}

// DD-MM-YYYY, the format every other list in this app prints.
export function fmtDate(s) {
  if (!s) return '—';
  const day = String(s).slice(0, 10);
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : day;
}

export function fmtDateTime(s) {
  const d = parseTs(s);
  if (!d) return '—';
  return `${fmtDate(s)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// How long the ticket has been alive — the number a queue is actually read by.
export function age(createdAt, resolvedAt) {
  const from = parseTs(createdAt);
  if (!from) return '—';
  const to = parseTs(resolvedAt) || new Date();
  const mins = Math.max(0, Math.round((to - from) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

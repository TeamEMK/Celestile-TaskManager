/**
 * "Tentative Date" intake fields — a date that is a START DATE plus a number
 * of DAYS looked up from another field's value.
 *
 * This replaces a sheet-side ARRAYFORMULA that the office had on the
 * production FMS's Tentative Date column:
 *
 *   =ARRAYFORMULA(IF(D2:D990="","", TO_DATE(D2:D990)
 *     + IFNA(VLOOKUP(J2:J990, {"CNC",45; "Inlay",50; …}, 2, FALSE), 0)))
 *
 * A formula can only ever compute; the ask was "let me pick the date on the
 * form when I know better, and compute it when I leave it blank" — which a
 * cell can't do (typing into an ARRAYFORMULA range breaks the whole column).
 * So the field is a normal date box on the form, and on submit a blank one
 * is filled in here. The config lives on the field itself
 * (fms_intake_fields.auto_fill_value as JSON, field_type 'date_offset'):
 *
 *   { dateCol: 'D',            // column of the start date (a Date field, or
 *                              //   the auto-filled Timestamp)
 *     byCol:   'J',            // column whose value picks the days (the
 *                              //   VLOOKUP key — usually a dropdown)
 *     days:    { CNC: 45, Inlay: 50, … },   // the lookup table
 *     defaultDays: 0 }         // when the value isn't in the table (IFNA)
 *
 * Pure and client-safe: the form shows the date it WOULD fill in as a hint
 * while the person types, and the server computes the one that is written.
 * Both go through computeDateOffset so they can't disagree.
 */
import { colKey } from '@/lib/fieldVisibility';

export const DATE_OFFSET_TYPE = 'date_offset';

export function isDateOffsetField(field) {
  return String(field?.field_type || field?.type || '') === DATE_OFFSET_TYPE;
}

// The lookup table as people type it in the config box — one "Name:days"
// per line or comma-separated ("CNC:45, Inlay:50"). Also accepts "=" and a
// tab between the two, since that is what a paste from the sheet gives.
export function parseDaysTable(text) {
  const out = {};
  String(text ?? '').split(/[\n,;]+/).forEach((part) => {
    const m = part.match(/^\s*(.+?)\s*[:=\t]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) out[m[1].trim()] = Number(m[2]);
  });
  return out;
}

export function formatDaysTable(days) {
  return Object.entries(days || {}).map(([k, v]) => `${k}:${v}`).join('\n');
}

export function parseDateOffsetConfig(field) {
  let raw = field?.auto_fill_value;
  if (raw && typeof raw === 'object') return normalizeConfig(raw);
  try { return normalizeConfig(JSON.parse(String(raw || '') || '{}')); }
  catch { return normalizeConfig({}); }
}

function normalizeConfig(c) {
  const days = {};
  Object.entries(c?.days || {}).forEach(([k, v]) => {
    const n = Number(v);
    if (String(k).trim() && Number.isFinite(n)) days[String(k).trim()] = n;
  });
  const def = Number(c?.defaultDays);
  return {
    dateCol: colKey(c?.dateCol),
    byCol: colKey(c?.byCol),
    days,
    defaultDays: Number.isFinite(def) ? def : 0,
  };
}

export function serializeDateOffsetConfig(cfg) {
  return JSON.stringify(normalizeConfig(cfg));
}

// Accepts the shapes a start date reaches us in: ISO from a Date field
// ("2026-09-07"), the auto-fill Timestamp ("07/09/2026 18:04:11"), or a
// sheet-style DD-MM-YYYY. Returns YYYY-MM-DD or null. Pure string work —
// no Date-in-local-timezone round trip that could shift the day.
export function parseAnyDate(val) {
  const v = String(val ?? '').trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const dt = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(dt.getTime()) || dt.getUTCDate() !== Number(d)) return null;
    return iso;
  }
  return null;
}

export function addDays(iso, days) {
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() + Math.round(Number(days) || 0));
  return dt.toISOString().slice(0, 10);
}

// Days for one lookup value — exact match first, then case/space-insensitive
// (a "cnc" typed into a text field still finds "CNC"), else the default.
export function daysFor(cfg, byValue) {
  const key = String(byValue ?? '').trim();
  if (key in cfg.days) return cfg.days[key];
  const loose = key.toLowerCase();
  const hit = Object.keys(cfg.days).find((k) => k.toLowerCase() === loose);
  return hit !== undefined ? cfg.days[hit] : cfg.defaultDays;
}

/**
 * The date this field should hold when left blank: start date + days.
 *
 * `valueOf(field)` gives the current value of any field on the same form
 * (server: including auto-filled ones; client: with today for the
 * Timestamp). Returns { iso, days, startIso, by } — iso is null when the
 * start date is missing or unreadable, in which case the cell stays blank
 * rather than getting a guess.
 */
export function computeDateOffset(field, fields, valueOf) {
  const cfg = parseDateOffsetConfig(field);
  const list = Array.isArray(fields) ? fields : [];
  const byCol = (col) => list.find((f) => colKey(f?.col_letter ?? f?.colLetter) === col);
  const dateField = cfg.dateCol ? byCol(cfg.dateCol) : null;
  const byField = cfg.byCol ? byCol(cfg.byCol) : null;
  const startIso = dateField ? parseAnyDate(valueOf(dateField)) : null;
  const by = byField ? valueOf(byField) : '';
  const days = daysFor(cfg, by);
  return { iso: startIso ? addDays(startIso, days) : null, days, startIso, by: String(by ?? '').trim() };
}

/**
 * Live Tracking view helpers — pure, client-safe.
 *
 * Live Tracking mirrors an arbitrary Google Sheet tab (lib/liveTracking.js has
 * no per-column config the way FMS does), so everything the table needs to
 * *understand* about a sheet has to be sniffed out of its headers and values:
 * which column holds the priority, which one the branch, which one the
 * "actual complete" date, and which cells are really attachment links.
 */

/* ── column detection ─────────────────────────────────────────────── */

// First header matching any pattern, in pattern order (so an exact
// "Priority" beats a stray "Priority Remarks" column).
function findHeader(headers, patterns) {
  for (const re of patterns) {
    const i = (headers || []).findIndex((h) => re.test(String(h ?? '').trim()));
    if (i >= 0) return i;
  }
  return -1;
}

const PRIORITY_PATTERNS = [
  /^priority$/i,
  /\bpriority\b/i,
  /priorit/i,
];

const BRANCH_PATTERNS = [
  /^(branch|location|city|unit|office|region)$/i,
  /\b(branch|location|city|unit|office|region)\b/i,
];

// "Actual Complete Date", "Actual Completion Date", "Actual Date of Closing",
// "Completion Date (Actual)" — the sheets aren't consistent, so try widening
// patterns rather than insisting on one spelling.
const ACTUAL_DONE_PATTERNS = [
  /actual[^a-z]*(date[^a-z]*(of[^a-z]*)?)?(completion|complete|completed|closing|closed|close|finish|finished|delivery|delivered|done)/i,
  /(completion|complete|completed|closing|closed|finish|finished|delivery|delivered|done)[^a-z]*(date)?[^a-z]*\(?actual/i,
  /^actual\b(?=.*\bdate\b)/i,
];

// A tracker sheet usually carries several "actual" columns (Actual Start Date,
// Actual Handover…). Only the completion one may turn a row green, so headers
// naming another stage are taken out of the running before matching.
const NOT_COMPLETION_RE = /\b(start|started|begin|plan|planned|target|expected|estimate[d]?|due|revised)\b/i;

function findDoneHeader(headers) {
  const eligible = (headers || []).map((h, i) => ({ h, i }))
    .filter(({ h }) => !NOT_COMPLETION_RE.test(String(h ?? '')));
  for (const re of ACTUAL_DONE_PATTERNS) {
    const hit = eligible.find(({ h }) => re.test(String(h ?? '').trim()));
    if (hit) return hit.i;
  }
  return -1;
}

export function detectColumns(headers = [], rows = []) {
  const priorityIdx = findHeader(headers, PRIORITY_PATTERNS);
  const doneIdx     = findDoneHeader(headers);

  let branchIdx = findHeader(headers, BRANCH_PATTERNS);
  // Header-based detection misses sheets that just call the column "Site" or
  // nothing useful at all — fall back to the first column whose values
  // actually read as Bangalore/Hyderabad.
  if (branchIdx < 0) {
    for (let c = 0; c < headers.length; c++) {
      if (c === priorityIdx || c === doneIdx) continue;
      if (rows.some((r) => branchOf(r?.[c]) !== '')) { branchIdx = c; break; }
    }
  }
  // Date columns power the date-range filter and let the table print a real
  // date where the sheet API only ever hands back a serial number.
  const dateCols = detectDateColumns(headers, rows);
  const dateOrderByIdx = Object.fromEntries(dateCols.map((d) => [d.idx, d.order]));

  return { priorityIdx, branchIdx, doneIdx, dateCols, dateOrderByIdx };
}

/* ── value normalisation ──────────────────────────────────────────── */

export const BRANCHES = ['Bangalore', 'Hyderabad'];

export function branchOf(value) {
  const s = String(value ?? '').toLowerCase();
  if (!s.trim()) return '';
  if (/bengaluru|bangalore|banglore|b'?lore|\bblr\b/.test(s)) return 'Bangalore';
  if (/hyderabad|hydrabad|\bhyd\b/.test(s)) return 'Hyderabad';
  return '';
}

export const PRIORITIES = ['High', 'Medium', 'Low'];

export function priorityOf(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const l = s.toLowerCase();
  if (/high|urgent|critical|\bp\s*1\b|^h$|^1$/.test(l)) return 'High';
  if (/medium|moderate|normal|\bp\s*2\b|^med$|^m$|^2$/.test(l)) return 'Medium';
  if (/low|minor|\bp\s*3\b|^l$|^3$/.test(l)) return 'Low';
  return s; // unknown label — keep it, it still gets its own stat column
}

// A row counts as complete once its "actual" date column has anything in it.
export function isRowDone(row, doneIdx) {
  if (doneIdx == null || doneIdx < 0) return false;
  return String(row?.[doneIdx] ?? '').trim() !== '';
}

/* ── colours ──────────────────────────────────────────────────────── */

// Inline styles (not classes) because .table-row:hover sets a background —
// a class would lose to it, an inline style wins on specificity.
export const DONE_ROW = { bg: '#ecfdf5', accent: '#10b981', text: '#065f46' };

export const PRIORITY_ROW = {
  High:   { bg: '#fef2f2', accent: '#ef4444', text: '#7f1d1d' },
  Medium: { bg: '#fffbeb', accent: '#f59e0b', text: '#78350f' },
  Low:    { bg: '#eff6ff', accent: '#3b82f6', text: '#1e3a8a' },
};

export const PRIORITY_PILL = {
  High:   'bg-red-50 text-red-700 border border-red-200',
  Medium: 'bg-amber-50 text-amber-700 border border-amber-200',
  Low:    'bg-blue-50 text-blue-700 border border-blue-200',
};

export function rowTone(row, { priorityIdx, doneIdx }) {
  // Completed wins over priority: once the actual date lands, the row is
  // green regardless of how urgent it used to be.
  if (isRowDone(row, doneIdx)) return { ...DONE_ROW, kind: 'done' };
  const p = priorityIdx >= 0 ? priorityOf(row?.[priorityIdx]) : '';
  const tone = PRIORITY_ROW[p];
  return tone ? { ...tone, kind: 'priority', priority: p } : null;
}

/* ── dates ────────────────────────────────────────────────────────── */

// Sheets is read with valueRenderOption: 'UNFORMATTED_VALUE' (lib/fmsSheet.js),
// so a date cell arrives as a *serial number* — days since 1899-12-30 — and
// never as the "12-03-2026" the sheet shows. Printing that raw is how a bare
// "46107" ends up sitting in a Date column, and it's also why the date filter
// can't just string-compare.

const SHEET_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;

// 20000 ≈ 1954, 80000 ≈ 2119. A serial outside that isn't a date, it's an
// amount or an id that merely happens to be a number.
const SERIAL_MIN = 20000;
const SERIAL_MAX = 80000;

const localMidnight = (y, m, d) => {
  const dt = new Date(y, m, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

export function sheetSerialToDate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < SERIAL_MIN || n > SERIAL_MAX) return null;
  // Drop the fractional part: that's the time of day, and every comparison
  // here is day-grained.
  const utc = new Date(SHEET_EPOCH_UTC + Math.floor(n) * DAY_MS);
  return localMidnight(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ISO_RE   = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]|$)/;
const NUM_RE   = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s]|$)/;
const NAME_RE  = /^(\d{1,2})[-\s]([a-z]{3,})[-\s,]*(\d{2,4})$/i;   // 12 Mar 2026
const NAME2_RE = /^([a-z]{3,})[-\s](\d{1,2}),?[-\s]*(\d{2,4})$/i;  // Mar 12, 2026

const fullYear = (y) => (y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y);

/**
 * One sheet cell → a Date at local midnight, or null if it isn't a date.
 *
 * `order` disambiguates 03/04/2026, which is either 3 April or March 4th
 * depending on who typed it — see detectDateOrder, which decides that per
 * column from the values rather than guessing once for the whole app.
 */
export function parseSheetDate(value, order = 'dmy') {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null
      : localMidnight(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'number') return sheetSerialToDate(value);

  const s = String(value ?? '').trim();
  if (!s) return null;

  // A numeric string is still a serial — Sheets sends "45678" for some cells.
  if (/^\d+(\.\d+)?$/.test(s)) return sheetSerialToDate(s);

  let m = s.match(ISO_RE);
  if (m) return localMidnight(+m[1], +m[2] - 1, +m[3]);

  m = s.match(NUM_RE);
  if (m) {
    const a = +m[1], b = +m[2], y = fullYear(+m[3]);
    // A part over 12 can only be the day, whatever the column's usual order.
    const dayFirst = a > 12 ? true : b > 12 ? false : order !== 'mdy';
    const day = dayFirst ? a : b;
    const mon = dayFirst ? b : a;
    if (day < 1 || day > 31 || mon < 1 || mon > 12) return null;
    return localMidnight(y, mon - 1, day);
  }

  m = s.match(NAME_RE);
  if (m) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return mon < 0 ? null : localMidnight(fullYear(+m[3]), mon, +m[1]);
  }

  m = s.match(NAME2_RE);
  if (m) {
    const mon = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return mon < 0 ? null : localMidnight(fullYear(+m[3]), mon, +m[2]);
  }

  return null;
}

// Which way round a column writes 03/04/2026. Any value whose first part is
// over 12 settles it as day-first; a second part over 12 settles it as
// month-first. With no evidence either way these are Indian sheets, so
// day-first is the safer default.
export function detectDateOrder(values = []) {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const m = String(v ?? '').trim().match(NUM_RE);
    if (!m) continue;
    if (+m[1] > 12) dmy++;
    else if (+m[2] > 12) mdy++;
  }
  return mdy > dmy ? 'mdy' : 'dmy';
}

// Headers that name a date. A bare-number column needs this to qualify —
// SFT totals and order values live in the serial range too, and turning an
// amount into a date is far worse than leaving a date as a number.
const DATE_HEADER_RE = /(^|\b)(date|dt|deadline|eta|due|timestamp|day)(\b|$)|date$/i;

const DATE_SAMPLE = 60;   // rows sampled per column — enough to be sure, cheap
const DATE_SHARE  = 0.6;  // share of non-empty values that must parse

/**
 * Columns that hold dates, with the day/month order each one uses. Returned
 * in sheet order, so the filter's column picker reads left-to-right.
 */
export function detectDateColumns(headers = [], rows = []) {
  const out = [];
  for (let c = 0; c < headers.length; c++) {
    const header = String(headers[c] ?? '');
    const headerSaysDate = DATE_HEADER_RE.test(header.trim());
    const values = [];
    for (const r of rows) {
      const v = r?.[c];
      if (String(v ?? '').trim() !== '') values.push(v);
      if (values.length >= DATE_SAMPLE) break;
    }
    // A date column that is still entirely empty (nothing completed yet) is
    // worth offering as a filter — the header is all the evidence there is.
    if (!values.length) { if (headerSaysDate) out.push({ idx: c, header, order: 'dmy' }); continue; }

    const order = detectDateOrder(values);
    const parsed = values.filter((v) => parseSheetDate(v, order)).length;
    if (parsed / values.length < DATE_SHARE) continue;

    const allNumeric = values.every((v) => typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v).trim()));
    if (allNumeric && !headerSaysDate) continue;

    out.push({ idx: c, header, order });
  }
  return out;
}

export function formatSheetDate(d) {
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// yyyy-mm-dd (what <input type="date"> speaks) → local midnight, and back.
export function dateInputToDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? localMidnight(+m[1], +m[2] - 1, +m[3]) : null;
}

export function dateToInput(d) {
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ── filtering ────────────────────────────────────────────────────── */

export const EMPTY_FILTERS = {
  q: '', branch: '', priority: '', status: '', dateIdx: -1, from: '', to: '',
};

export function activeFilterCount(f = EMPTY_FILTERS) {
  return (f.q && f.q.trim() ? 1 : 0) + (f.branch ? 1 : 0) + (f.priority ? 1 : 0)
    + (f.status ? 1 : 0) + ((f.dateIdx >= 0 && (f.from || f.to)) ? 1 : 0);
}

/**
 * Every filter the toolbar can apply, in one predicate.
 *
 * `dateOrder` is the order detected for the chosen date column (see
 * detectDateColumns) — passing it through keeps 03/04 from meaning one thing
 * in the filter and another in the table.
 */
export function rowMatchesFilters(row, cols, f, dateOrder = 'dmy') {
  const { priorityIdx, branchIdx, doneIdx } = cols;

  const q = f.q && f.q.trim().toLowerCase();
  if (q && !row.some((c) => String(c ?? '').toLowerCase().includes(q))) return false;

  if (f.branch) {
    const b = (branchIdx >= 0 ? branchOf(row?.[branchIdx]) : '') || 'Other';
    if (b !== f.branch) return false;
  }

  if (f.priority) {
    if (priorityIdx < 0) return false;
    if (priorityOf(row?.[priorityIdx]) !== f.priority) return false;
  }

  if (f.status) {
    const done = isRowDone(row, doneIdx);
    if (f.status === 'done' && !done) return false;
    if (f.status === 'pending' && done) return false;
  }

  if (f.dateIdx >= 0 && (f.from || f.to)) {
    const d = parseSheetDate(row?.[f.dateIdx], dateOrder);
    // A row with nothing in that column can't be inside a date window —
    // hiding it is the honest answer, not showing it "just in case".
    if (!d) return false;
    const from = dateInputToDate(f.from);
    const to   = dateInputToDate(f.to);
    if (from && d < from) return false;
    if (to && d > to) return false;
  }

  return true;
}

/* ── attachment links ─────────────────────────────────────────────── */

const URL_RE = /https?:\/\/[^\s,;|"'<>]+/gi;
const IMG_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif|tiff?|svg)(\?|#|$)/i;
const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|dwg)(\?|#|$)/i;

// A Google Form file-upload answer lands in the sheet as one cell holding
// every uploaded file's Drive URL, comma-separated — so a single cell often
// means several images.
export function extractLinks(value) {
  const s = String(value ?? '');
  if (!s.trim()) return [];
  const out = [];
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(s)) !== null) {
    const url = m[0].replace(/[),.\]]+$/, '');
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

// Whatever is left in the cell once the URLs are stripped out.
export function textWithoutLinks(value) {
  return String(value ?? '').replace(URL_RE, '').replace(/[\s,;|]+/g, ' ').trim();
}

export function driveFileId(url) {
  const s = String(url ?? '');
  if (!/drive\.google\.com|docs\.google\.com|googleusercontent\.com/i.test(s)) return '';
  const m =
    s.match(/\/file\/d\/([-\w]{12,})/) ||
    s.match(/[?&]id=([-\w]{12,})/) ||
    s.match(/\/d\/([-\w]{12,})/) ||
    s.match(/googleusercontent\.com\/d\/([-\w]{12,})/);
  return m ? m[1] : '';
}

// 'image' = worth opening in the viewer, 'file' = just a download link.
// A bare Drive link doesn't say what it holds, so it's treated as an image
// and the viewer falls back to a plain link if nothing renders.
export function linkKind(url) {
  const s = String(url ?? '');
  if (IMG_EXT.test(s)) return 'image';
  if (DOC_EXT.test(s)) return 'file';
  if (/googleusercontent\.com/i.test(s)) return 'image';
  if (/docs\.google\.com\/(document|spreadsheets|presentation|forms)/i.test(s)) return 'file';
  if (driveFileId(s)) return 'image';
  return 'link';
}

// Ordered <img src> candidates for one link. Drive files uploaded through a
// Form aren't link-shareable, so /api/drive/<id> (service account, same
// origin) is tried first; the public thumbnail/lh3 hosts cover files the
// service account can't see but the world can.
export function imageCandidates(url) {
  const id = driveFileId(url);
  if (!id) return [String(url)];
  return [
    `/api/drive/${id}`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w2000`,
    `https://lh3.googleusercontent.com/d/${id}=w2000`,
  ];
}

/* ── AppSheet upload paths ────────────────────────────────────────── */

// These sheets are AppSheet data sources, and an AppSheet file column stores a
// path relative to the app's Drive folder rather than a URL:
//   Live form_Files_/02-27-2026 14-03-58.Document Upload.084556.NAME.pdf
// There is no hyperlink on the cell either, so the path has to be turned into
// a Drive file id server-side (lib/liveTrackingFiles.js) before anything is
// clickable. Kept here — with no googleapis import — so both sides share it.
const APPSHEET_MARKER = /_Files_[/\\]/;

export function isAppSheetPath(value) {
  return APPSHEET_MARKER.test(String(value ?? ''));
}

// AppSheet joins several uploads in one cell with commas. A filename may
// itself contain a comma, so a fragment that isn't a path of its own is glued
// back onto the previous one rather than dropped.
export function splitAppSheetPaths(value) {
  const s = String(value ?? '').trim();
  if (!s || !APPSHEET_MARKER.test(s)) return [];
  const out = [];
  for (const part of s.split(/\s*,\s*/)) {
    if (APPSHEET_MARKER.test(part)) out.push(part);
    else if (out.length) out[out.length - 1] += `, ${part}`;
  }
  return out.map((p) => p.trim()).filter(Boolean);
}

export function splitAppSheetPath(p) {
  const s = String(p ?? '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i >= 0 ? { folder: s.slice(0, i), name: s.slice(i + 1) } : { folder: '', name: s };
}

// Last resort when the Drive folder isn't shared with the service account:
// open Drive's own search for the filename. The viewer is signed in to their
// Celestile account in that tab, so if they have access they land on the file.
export function driveSearchUrl(name) {
  return `https://drive.google.com/drive/search?q=${encodeURIComponent(`"${name}"`)}`;
}

/* ── what one cell should render as ───────────────────────────────── */

// Handles both shapes a cell can take: plain http(s) URLs, and AppSheet upload
// paths resolved through the `fileLinks` map the API sends alongside the rows.
export function cellAttachments(value, fileLinks) {
  const val = String(value ?? '').trim();
  const images = [];
  const files = [];

  if (isAppSheetPath(val)) {
    for (const p of splitAppSheetPaths(val)) {
      const { name } = splitAppSheetPath(p);
      const href = fileLinks?.[p];
      if (!href) {
        files.push({ href: driveSearchUrl(name), name, unresolved: true });
      } else if (IMG_EXT.test(name)) {
        images.push({ href, candidates: [href], name });
      } else {
        files.push({ href, name });
      }
    }
    return { text: '', images, files, appSheet: true };
  }

  for (const url of extractLinks(val)) {
    if (linkKind(url) === 'image') images.push({ href: url, candidates: imageCandidates(url), name: url });
    else files.push({ href: url, name: url });
  }
  return { text: images.length || files.length ? textWithoutLinks(val) : val, images, files, appSheet: false };
}

/* ── priority stats ───────────────────────────────────────────────── */

// Priority × branch counts for the summary panel. Branch always lists
// Bangalore and Hyderabad (even at zero, so the two are comparable at a
// glance) plus an "Other" bucket only when something actually lands there.
export function buildPriorityStats(rows = [], { priorityIdx, branchIdx, doneIdx }) {
  if (priorityIdx == null || priorityIdx < 0) return null;

  const custom = [];
  const cells = {}; // branch -> priority -> { total, done }
  const touch = (b, p) => {
    cells[b] = cells[b] || {};
    cells[b][p] = cells[b][p] || { total: 0, done: 0 };
    return cells[b][p];
  };

  let otherBranchSeen = false;

  for (const row of rows) {
    const p = priorityOf(row?.[priorityIdx]);
    if (!p) continue;
    if (!PRIORITIES.includes(p) && !custom.includes(p)) custom.push(p);
    const branch = (branchIdx >= 0 ? branchOf(row?.[branchIdx]) : '') || 'Other';
    if (branch === 'Other') otherBranchSeen = true;
    const cell = touch(branch, p);
    cell.total++;
    if (isRowDone(row, doneIdx)) cell.done++;
  }

  // Only priorities the sheet actually uses. These trackers label rows
  // "High"/"Regular" and never touch Medium/Low, and a row of permanently-zero
  // cards is just noise. Everything falls back to the full list if a sheet
  // somehow has no recognised priority at all.
  const used = [...PRIORITIES, ...custom.sort()].filter((p) => cells.Bangalore?.[p] || cells.Hyderabad?.[p] || cells.Other?.[p]);
  const priorities = used.length ? used : PRIORITIES;

  const branches = branchIdx >= 0
    ? [...BRANCHES, ...(otherBranchSeen ? ['Other'] : [])]
    : ['Other'];

  const sum = (list, get) => list.reduce(
    (acc, x) => { const c = get(x); return { total: acc.total + c.total, done: acc.done + c.done }; },
    { total: 0, done: 0 });

  const at       = (b, p) => cells[b]?.[p] || { total: 0, done: 0 };
  const rowTotal = (b) => sum(priorities, (p) => at(b, p));
  const colTotal = (p) => sum(branches,   (b) => at(b, p));
  const grand    = sum(branches, (b) => rowTotal(b));

  if (grand.total === 0) return null;

  return {
    priorities, branches, at, rowTotal, colTotal, grand,
    hasBranch: branchIdx >= 0,
    hasDone: doneIdx != null && doneIdx >= 0,
  };
}

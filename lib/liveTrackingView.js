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
  return { priorityIdx, branchIdx, doneIdx };
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

  const priorities = [...PRIORITIES, ...custom.sort()];
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

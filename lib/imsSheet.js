import { getSheetsClient } from './googleCreds';

/**
 * Stone Inventory Factory ⇄ the "Celestile---Project IMS V2" spreadsheet.
 *
 * The factory's slab register already lives in that sheet's `Data` tab and is
 * still being written to by the older Apps Script forms (Inward / Step-2, see
 * its `Index` tab). So the sheet — not the app's own database — is the source
 * of truth for inventory, and this module is the only way the app touches it.
 *
 * Two constraints shape everything below:
 *
 *  1. The sheet's layout must not change. There is no id column, and no
 *     natural key either: `Uniquekey` is per-LOT (≈19 slabs share one) and
 *     even Uniquekey+SLAB No repeats. So a slab's id is its ROW NUMBER, with
 *     slab + key carried alongside as a checksum — see encodeId/resolveRow.
 *
 *  2. The old forms keep appending rows, so we never rewrite the whole range
 *     (that would clobber a row appended since our last read). Writes are
 *     either values.append or a targeted single-row update.
 *
 * Everything the app deals with uses the same camelCase field names the old
 * MySQL/Sheets `inventory` table exposed, so the API routes read the same.
 */

export const IMS_SHEET_ID = (process.env.IMS_SHEET_ID || '1dmAHEQAuau9HB5C2JGXfkHPN1vVEUf3tGT6aWBduG6E').trim();
const DATA_TAB = process.env.IMS_DATA_TAB || 'Data';
const MASTER_TAB = process.env.IMS_MASTER_TAB || 'Stone Name';
const TZ = 'Asia/Kolkata'; // the sheet's timestamps are IST wall-clock

/* Sheet column order for the `Data` tab — A..T. Index in this array IS the
   column, so never reorder; append only if the sheet gains a column. */
const COLUMNS = [
  'createdAt',      // A  Timestamp
  'key',            // B  Uniquekey
  'slab',           // C  SLAB No
  'block',          // D  BLOCK
  'material',       // E  MATERIAL
  'thickness',      // F  THICKNESS
  'sizeL',          // G  SIZE(L)
  'sizeW',          // H  SIZE(W)
  'sft',            // I  SFT
  'slabPhoto',      // J  Slab Photo URL
  'status',         // K  STATUS
  'updatedAt',      // L  Status Timestamp
  'orderNo',        // M  Order Number
  'client',         // N  Client Name
  'area',           // O  Area
  'cutting',        // P  Cutting required
  'cuttingReason',  // Q  Cutting reason
  'cuttingSizeL',   // R  Cutting size L
  'cuttingSizeW',   // S  Cutting size W
  'remarks',        // T  Remarks
];
const LAST_COL = 'T';
const DATE_COLUMNS = new Set(['createdAt', 'updatedAt']);

/* ── Google client ─────────────────────────────────────────────────────── */

const api = getSheetsClient;

// Sheets rate-limits per minute; a burst of slab edits shouldn't surface as a
// red toast when waiting a second would have worked.
async function withRetry(fn, label = 'ims') {
  const delays = [400, 1000, 2200, 4500, 8000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try { return await fn(); }
    catch (err) {
      const code = err?.code || err?.response?.status;
      if (!(code === 429 || code === 503 || code === 500) || attempt === delays.length) { lastErr = err; break; }
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  console.error(`[ims] ${label} failed:`, lastErr?.message);
  throw lastErr;
}

// Tab names with spaces ("Stone Name") must be quoted in an A1 range.
const at = (tab, a1) => `'${String(tab).replace(/'/g, "''")}'!${a1}`;

/* ── value coercion ────────────────────────────────────────────────────── */

// The sheet shows "20/05/2026 17:15:24" (IST). The app speaks ISO everywhere —
// including the createdAt string it sorts the stock list on — so convert at
// the boundary in both directions.
export function fromSheetTs(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return s; // already ISO, or something we shouldn't mangle
  const [, d, mo, y, h = '0', mi = '0', se = '0'] = m;
  // IST is a fixed +05:30 — no DST to worry about.
  const utc = Date.UTC(+y, +mo - 1, +d, +h - 5, +mi - 30, +se);
  return new Date(utc).toISOString();
}

export function toSheetTs(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

// Photos: the sheet holds shareable drive.google.com links (that's what the old
// forms wrote, and what someone clicking the cell expects). The app's <img>
// tags can't load those, so on the way in they become the app's own proxy URL.
const driveIdOf = (v) => {
  const s = String(v || '');
  return (s.match(/\/file\/d\/([\w-]{20,})/) || s.match(/[?&]id=([\w-]{20,})/) ||
          s.match(/\/api\/drive\/([\w-]{20,})/) || [])[1] || '';
};
const photoIn = (v) => {
  const id = driveIdOf(v);
  return id ? `/api/drive/${id}?kind=image` : String(v || '');
};
const photoOut = (v) => {
  const s = String(v || '');
  // A base64 data-URI would blow past the sheet's 50,000-char cell limit and
  // fail the whole write — drop it rather than lose the slab.
  if (s.startsWith('data:')) {
    console.error('[ims] refusing to write an inline base64 photo to the sheet (Drive upload must have failed)');
    return '';
  }
  const id = driveIdOf(s);
  return id ? `https://drive.google.com/file/d/${id}/view` : s;
};

// USER_ENTERED lets dates and numbers land as real dates/numbers (what the
// sheet's own formulas expect), but it also means a remark starting with "="
// would become a formula. Force those to text.
const safeCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /^[=+@]/.test(s) ? `'${s}` : s;
};

function rowToObj(cells, rowNum) {
  const o = { __row: rowNum };
  COLUMNS.forEach((f, i) => {
    const raw = cells[i];
    o[f] = DATE_COLUMNS.has(f) ? fromSheetTs(raw)
      : f === 'slabPhoto' ? photoIn(raw)
      : raw === null || raw === undefined ? '' : String(raw);
  });
  o.id = encodeId(rowNum, o);
  return o;
}

function objToRow(o) {
  return COLUMNS.map((f) => {
    const v = o[f];
    if (DATE_COLUMNS.has(f)) return toSheetTs(v);
    if (f === 'slabPhoto') return photoOut(v);
    return safeCell(v);
  });
}

/* ── ids ───────────────────────────────────────────────────────────────── */
// "R1487~43~CE-22-06-LOT-2691" — row number to go straight to the slab, plus
// slab + key so we can tell that the row still holds the slab we were handed
// (someone may have inserted/deleted rows in the sheet meanwhile).

const SEP = '~';
const tok = (v) => String(v ?? '').replace(/~/g, '-').trim();
export const encodeId = (rowNum, o) => `R${rowNum}${SEP}${tok(o.slab)}${SEP}${tok(o.key)}`;
export function decodeId(id) {
  const [r, slab = '', key = ''] = String(id || '').split(SEP);
  const row = Number(String(r).replace(/^R/, ''));
  return { row: Number.isFinite(row) && row > 1 ? row : 0, slab, key };
}

/* ── read ──────────────────────────────────────────────────────────────── */

const g = globalThis;
if (!g.__imsCache) g.__imsCache = { rows: null, at: 0 };
const CACHE_TTL_MS = 8000; // one page load fires several requests; don't re-read per request

export function invalidate() { g.__imsCache = { rows: null, at: 0 }; }

async function loadRows(force = false) {
  if (!force && g.__imsCache.rows && Date.now() - g.__imsCache.at < CACHE_TTL_MS) return g.__imsCache.rows;
  const res = await withRetry(() => api().spreadsheets.values.get({
    spreadsheetId: IMS_SHEET_ID,
    range: at(DATA_TAB, `A2:${LAST_COL}`),
  }), 'read Data');
  const values = res.data.values || [];
  // Row numbers must stay true to the sheet, so map before filtering.
  const rows = values
    .map((cells, i) => rowToObj(cells, i + 2))
    .filter((r) => String(r.slab).trim() !== '');
  g.__imsCache = { rows, at: Date.now() };
  return rows;
}

/** Every slab in the register, newest first. */
export async function listSlabs() {
  const rows = await loadRows();
  return [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function findByOrder(orderNo) {
  const want = String(orderNo || '').trim().toLowerCase();
  if (!want) return [];
  const rows = await loadRows();
  return rows.filter((r) => String(r.orderNo || '').trim().toLowerCase() === want);
}

/** Resolve an id to its current row, tolerating rows having shifted. */
export async function resolveRow(id) {
  const { row, slab, key } = decodeId(id);
  const rows = await loadRows();
  const hit = rows.find((r) => r.__row === row);
  if (hit && tok(hit.slab) === slab && tok(hit.key) === key) return hit;
  // Rows moved under us — fall back to the checksum. Ambiguous only if the
  // same slab+key pair repeats, in which case the first is as good a guess as
  // the caller had anyway.
  const rescan = await loadRows(true);
  return rescan.find((r) => r.__row === row && tok(r.slab) === slab && tok(r.key) === key)
      || rescan.find((r) => tok(r.slab) === slab && tok(r.key) === key)
      || null;
}

/* ── write ─────────────────────────────────────────────────────────────── */

/** Append slabs to the bottom of `Data` — never touches existing rows. */
export async function appendSlabs(entries) {
  if (!entries.length) return 0;
  await withRetry(() => api().spreadsheets.values.append({
    spreadsheetId: IMS_SHEET_ID,
    range: at(DATA_TAB, `A:${LAST_COL}`),
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: entries.map(objToRow) },
  }), 'append Data');
  invalidate();
  return entries.length;
}

/** Overwrite whole rows, one targeted range each, in a single API call. */
export async function writeRows(updates) {
  if (!updates.length) return 0;
  await withRetry(() => api().spreadsheets.values.batchUpdate({
    spreadsheetId: IMS_SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates.map(({ row, obj }) => ({
        range: at(DATA_TAB, `A${row}:${LAST_COL}${row}`),
        values: [objToRow(obj)],
      })),
    },
  }), 'update Data');
  invalidate();
  return updates.length;
}

let _gid = null;
async function dataTabGid() {
  if (_gid !== null) return _gid;
  const meta = await withRetry(() => api().spreadsheets.get({
    spreadsheetId: IMS_SHEET_ID, fields: 'sheets.properties(title,sheetId)',
  }), 'meta');
  const tab = (meta.data.sheets || []).find((s) => s.properties.title === DATA_TAB);
  if (!tab) throw new Error(`IMS sheet has no "${DATA_TAB}" tab`);
  _gid = tab.properties.sheetId;
  return _gid;
}

export async function deleteRow(rowNum) {
  const sheetId = await dataTabGid();
  await withRetry(() => api().spreadsheets.batchUpdate({
    spreadsheetId: IMS_SHEET_ID,
    requestBody: {
      requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum } } }],
    },
  }), 'delete row');
  invalidate();
}

/* ── lot keys ──────────────────────────────────────────────────────────── */
// The old form stamps ONE Uniquekey per submission (≈19 slabs share it) and
// numbers it off the register's running row count: CE-DD-MM-LOT-2691.
export async function nextLotKey() {
  const rows = await loadRows(true);
  const d = new Date();
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit' })
    .formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
  return `CE-${p.day}-${p.month}-LOT-${String(rows.length + 1).padStart(3, '0')}`;
}

/* ── material master ("Stone Name" tab) ────────────────────────────────── */

export async function listMaterials() {
  const res = await withRetry(() => api().spreadsheets.values.get({
    spreadsheetId: IMS_SHEET_ID, range: at(MASTER_TAB, 'A2:B'),
  }), 'read Stone Name');
  return (res.data.values || [])
    .map((r) => ({ material: String(r[0] ?? '').trim(), thickness: String(r[1] ?? '').trim() }))
    .filter((r) => r.material);
}

export async function addMaterial(material, thickness) {
  await withRetry(() => api().spreadsheets.values.append({
    spreadsheetId: IMS_SHEET_ID,
    range: at(MASTER_TAB, 'A:B'),
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[safeCell(material), safeCell(thickness)]] },
  }), 'append Stone Name');
}

/* Shape a slab the way the API has always returned it (id + camelCase). */
export const publicSlab = (r) => ({
  id: r.id, createdAt: r.createdAt || '', key: r.key || '', slab: r.slab || '',
  block: r.block || '-', material: r.material || '', thickness: r.thickness || '',
  sizeL: r.sizeL || '', sizeW: r.sizeW || '', sft: r.sft || '', slabPhoto: r.slabPhoto || '',
  status: r.status || 'Available', updatedAt: r.updatedAt || '', orderNo: r.orderNo || '',
  client: r.client || '', area: r.area || '', cutting: r.cutting || '',
  cuttingReason: r.cuttingReason || '', cuttingSizeL: r.cuttingSizeL || '',
  cuttingSizeW: r.cuttingSizeW || '', remarks: r.remarks || '',
});

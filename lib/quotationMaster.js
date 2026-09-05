/**
 * Quotation item master — live Google Sheet.
 *
 * The quotation forms used to carry a hardcoded MATERIAL_LIST and a free-text
 * thickness box. The real master lives in the spreadsheet the team already
 * maintains (the one the original sheet-based quotation tool read), so the
 * dropdowns are filled from it and "+ Add new item" appends a row back into
 * it — nothing is copied into our DB.
 *
 * Nothing here is fatal: if the sheet is unreachable (not shared with the
 * service account, renamed tab, no credentials) we report the reason and the
 * form falls back to its old built-in list.
 */
import { getSheetsClient } from '@/lib/googleCreds';

const DEFAULT_SHEET_ID = '1dmAHEQAuau9HB5C2JGXfkHPN1vVEUf3tGT6aWBduG6E';
const DEFAULT_GID = '1360381011';

export const MASTER_SHEET_ID = process.env.QUOTATION_MASTER_SHEET_ID || DEFAULT_SHEET_ID;
const MASTER_GID  = process.env.QUOTATION_MASTER_GID || DEFAULT_GID;
const MASTER_TAB  = process.env.QUOTATION_MASTER_TAB || '';   // wins over the gid when set

const REQUEST_TIMEOUT_MS = 20000;
const CACHE_TTL_MS = 60000;   // the master changes rarely; adding an item busts it

const sheetsApi = getSheetsClient;

async function withRetry(fn, label = 'quotation-master') {
  const delays = [500, 1200, 2500];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try { return await fn(); }
    catch (err) {
      const code = err?.code || err?.response?.status;
      if (!(code === 429 || code === 503 || code === 500) || attempt === delays.length) { lastErr = err; break; }
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}

/* ── which tab? ────────────────────────────────────────────────────────── */
let _tabCache = null;   // { name, at }

async function resolveTabName() {
  if (MASTER_TAB) return MASTER_TAB;
  if (_tabCache && Date.now() - _tabCache.at < 10 * 60 * 1000) return _tabCache.name;
  const sheets = sheetsApi();
  const meta = await withRetry(() => sheets.spreadsheets.get(
    { spreadsheetId: MASTER_SHEET_ID, fields: 'sheets.properties(sheetId,title)' },
    { timeout: REQUEST_TIMEOUT_MS },
  ), 'meta');
  const tabs = (meta.data.sheets || []).map((s) => s.properties);
  const byGid = tabs.find((t) => String(t.sheetId) === String(MASTER_GID));
  const name = (byGid || tabs[0])?.title;
  if (!name) throw new Error('The quotation master spreadsheet has no tabs');
  _tabCache = { name, at: Date.now() };
  return name;
}

/* ── column detection ──────────────────────────────────────────────────── */
// Header names are whatever the team typed, so match on intent rather than an
// exact string. Falls back to "first column = item, second = thickness",
// which is how the sheet is laid out when it has no header row at all.
const ITEM_RE = /^(item|item ?name|material|stone|product|name)\b/i;
const THK_RE  = /thick/i;

function pickColumns(headerRow) {
  const cells = (headerRow || []).map((c) => String(c ?? '').trim());
  let item = cells.findIndex((c) => ITEM_RE.test(c));
  let thk  = cells.findIndex((c) => THK_RE.test(c));
  const hasHeader = item >= 0 || thk >= 0;
  if (item < 0) item = 0;
  if (thk < 0) thk = hasHeader ? -1 : 1;
  return { item, thk, hasHeader };
}

const clean = (v) => String(v ?? '').trim();

// Keeps the sheet's own order (it is curated alphabetically) while dropping
// blanks and case-only duplicates.
function uniqItems(arr) {
  const seen = new Set(), out = [];
  for (const v of arr) {
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push(v);
  }
  return out;
}

// The thickness column is hand-typed, so it holds "30MM", "30 MM" and a stray
// "MM" all at once. Normalise for the dropdown only — the sheet is untouched.
function uniqThicknesses(arr) {
  const seen = new Set();
  for (const v of arr) {
    const t = v.toUpperCase().replace(/\s+/g, '');
    if (!/\d/.test(t)) continue;      // "MM" on its own, notes, etc.
    seen.add(t);
  }
  return Array.from(seen).sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
}

// The master lists a thickness against each stone, so "Indian satvario
// marble" can offer 20MM and 30MM and nothing else. Keyed lowercase because
// the sheet is hand-typed and the same stone appears with different casing.
function thicknessesByItem(body, itemIdx, thkIdx) {
  const map = {};
  if (thkIdx < 0) return map;
  for (const row of body) {
    const item = clean(row[itemIdx]);
    const thk = uniqThicknesses([clean(row[thkIdx])]);
    if (!item || !thk.length) continue;
    const key = item.toLowerCase();
    if (!map[key]) map[key] = [];
    if (!map[key].includes(thk[0])) map[key].push(thk[0]);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  }
  return map;
}

/* ── read ──────────────────────────────────────────────────────────────── */
let _cache = null;   // { at, data }

export async function getQuotationMaster(force = false) {
  if (!force && _cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.data;

  const tab = await resolveTabName();
  const sheets = sheetsApi();
  const res = await withRetry(() => sheets.spreadsheets.values.get(
    { spreadsheetId: MASTER_SHEET_ID, range: `'${tab}'!A1:Z`, valueRenderOption: 'UNFORMATTED_VALUE' },
    { timeout: REQUEST_TIMEOUT_MS },
  ), 'values');

  const rows = res.data.values || [];
  const { item: itemIdx, thk: thkIdx, hasHeader } = pickColumns(rows[0]);
  const body = hasHeader ? rows.slice(1) : rows;

  const items = uniqItems(body.map((r) => clean(r[itemIdx])));
  const thicknesses = thkIdx >= 0 ? uniqThicknesses(body.map((r) => clean(r[thkIdx]))) : [];
  const thicknessByItem = thicknessesByItem(body, itemIdx, thkIdx);

  const data = { items, thicknesses, thicknessByItem, tab, itemIdx, thkIdx, hasHeader };
  _cache = { at: Date.now(), data };
  return data;
}

/* ── write ─────────────────────────────────────────────────────────────── */
// Appends one row to the master. Thickness is optional — the forms only
// require a name, matching the old tool's "Add item" prompt.
export async function addQuotationMasterItem(item, thickness = '') {
  const name = clean(item);
  if (!name) throw new Error('Item name required');

  const master = await getQuotationMaster(true);
  const { tab, itemIdx, thkIdx } = master;
  if (master.items.some((m) => m.toLowerCase() === name.toLowerCase())) {
    return { added: false, item: name, reason: 'already in the master' };
  }

  const width = Math.max(itemIdx, thkIdx) + 1;
  const row = Array.from({ length: width }, () => '');
  row[itemIdx] = name;
  if (thkIdx >= 0 && clean(thickness)) row[thkIdx] = clean(thickness);

  const sheets = sheetsApi();
  await withRetry(() => sheets.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: `'${tab}'!A:Z`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  }, { timeout: REQUEST_TIMEOUT_MS }), 'append');

  _cache = null;
  return { added: true, item: name };
}

// Turns Google's opaque failures into something an admin can act on — the
// common one is simply "the sheet was never shared with the service account".
export function explainMasterError(err) {
  const code = err?.code || err?.response?.status;
  const email = (() => { try { return requireGoogleCredentials().client_email; } catch { return ''; } })();
  if (code === 403) {
    return `Quotation master sheet is not shared with the app. Share it with ${email || 'the service account'} (Editor, so "Add item" can write back).`;
  }
  if (code === 404) return 'Quotation master sheet not found — check QUOTATION_MASTER_SHEET_ID.';
  return err?.message || 'Could not read the quotation master sheet';
}

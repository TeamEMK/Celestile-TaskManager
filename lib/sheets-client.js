/**
 * Google Sheets as the database — low-level client.
 *
 * Each "table" is a tab in the spreadsheet. Row 1 = headers (column names,
 * exactly the MySQL column names). Data rows follow.
 *
 * This module handles:
 *   - service-account auth
 *   - ensuring every tab exists with its header row
 *   - loading all tabs into an in-memory cache (one batchGet)
 *   - flushing a single tab back to the sheet
 *
 * The SQL layer (lib/sql-sheets.js) operates purely on the cached row objects
 * this module exposes, then asks us to flush the tables it changed.
 */
import { google } from 'googleapis';
import { getGoogleCredentials, requireGoogleCredentials } from './googleCreds';

const SPREADSHEET_ID = process.env.SHEETS_DB_ID;

// Credentials come from env vars (GOOGLE_SERVICE_ACCOUNT_EMAIL +
// GOOGLE_PRIVATE_KEY) OR a gitignored credentials.json file — lib/googleCreds.js
// picks whichever is present and actually parses.
function haveCredentials() {
  const { client_email, private_key } = getGoogleCredentials();
  return !!(client_email && private_key);
}

/* Column order per tab — these ARE the header rows and must match the column
   names used in the app's SQL. Order matters (it's the on-sheet layout). */
export const SCHEMAS = {
  users: ['id', 'name', 'email', 'phone', 'department', 'roles', 'active', 'password_hash', 'picture', 'force_logout_after', 'created_at', 'access'],
  delegations: ['id', 'description', 'doer_id', 'doer', 'delegated_by', 'due_date', 'client', 'status', 'type', 'priority', 'approval', 'approver_id', 'approver', 'url', 'remarks', 'revise_action', 'transferred_by', 'transferred_from', 'created_at', 'completed_at', 'image'],
  masters: ['id', 'task', 'assigned_to', 'frequency', 'start_date', 'created_at'],
  holidays: ['id', 'date', 'name', 'type'],
  // FMS — sheet-config tables. The Google Sheet each fms_sheets row points at
  // stays the live source of truth; these only store which columns to read/write.
  fms_sheets: ['id', 'fms_name', 'sheet_name', 'sheet_id', 'header_row', 'created_by', 'created_at', 'process_coordinator_id', 'intake_sheet_id', 'intake_sheet_name', 'intake_header_row', 'intake_form_name'],
  fms_sheet_steps: ['id', 'fms_id', 'step_order', 'step_name', 'plan_col', 'actual_col', 'extra_input', 'extra_col', 'show_cols', 'delay_reason_col', 'doer_name_col'],
  fms_step_doers: ['step_id', 'user_id'],
  fms_extra_rows: ['id', 'step_id', 'row_label', 'col_letter', 'field_type', 'dropdown_options', 'required'],
  fms_intake_fields: ['id', 'fms_id', 'field_label', 'col_letter', 'field_type', 'dropdown_options', 'required', 'sort_order'],
  profile: ['user_id', 'notification_email'],
  app_config: ['key', 'value'],
  checklist_completions: ['id', 'master_id', 'doer', 'completed_at', 'date'],
  meetings: ['id', 'title', 'meeting_date', 'start_time', 'end_time', 'attendees', 'notes', 'created_by', 'created_at'],
  leaves: ['id', 'user_id', 'user_name', 'type', 'from_date', 'to_date', 'reason', 'status', 'approver', 'created_at', 'decided_at'],
  daily_tasks: ['id', 'entry_date', 'doer_id', 'doer', 'client', 'department', 'description', 'minutes', 'created_at', 'order_number', 'area_name', 'task_type', 'software', 'revision'],
  clients: ['id', 'name', 'contact_person', 'contact_number', 'email', 'industry', 'status', 'notes', 'created_at'],
  dev_backups: ['id', 'label', 'data', 'created_at', 'expires_at'],
  quotations: ['id', 'ref_no', 'branch', 'client_name', 'client_firm', 'client_contact', 'client_email', 'pan', 'architect_name', 'architect_firm', 'architect', 'consultant', 'consultant_number', 'consultant_email', 'boutique', 'payment_terms', 'validity', 'lead_time', 'transport', 'billing_address', 'site_address', 'grand_total', 'discount_pct', 'design_fees', 'installation_charges', 'packing_charges', 'stone_items', 'totals_config', 'fixing_items', 'pdf', 'created_at', 'status', 'created_by_id', 'created_by_name', 'approval_token', 'approved_by', 'approved_at', 'quote_date'],
  consultants: ['name', 'mobile', 'email'],
  inventory: ['id', 'created_at', 'inv_key', 'slab', 'block', 'material', 'thickness', 'size_l', 'size_w', 'sft', 'slab_photo', 'status', 'updated_at', 'order_no', 'client', 'area', 'cutting', 'cutting_reason', 'cutting_size_l', 'cutting_size_w', 'remarks'],
  stone_master: ['id', 'material', 'thickness'],
  fsm_step2: ['id', 'inv_key', 'created_at', 'order_no', 'material', 'all_pieces', 'grain', 'grain_img', 'issue', 'cutting_required', 'mat_img', 'sizes_packing'],
};

/* Primary key column(s) per table — used for ON DUPLICATE KEY / upserts. */
export const PRIMARY_KEYS = {
  users: ['id'], delegations: ['id'], masters: ['id'], holidays: ['id'],
  fms_sheets: ['id'], fms_sheet_steps: ['id'], fms_step_doers: ['step_id', 'user_id'],
  fms_extra_rows: ['id'], fms_intake_fields: ['id'], profile: ['user_id'],
  app_config: ['key'], checklist_completions: ['id'], meetings: ['id'],
  leaves: ['id'], daily_tasks: ['id'], clients: ['id'], dev_backups: ['id'],
  quotations: ['id'], consultants: ['name'],
  inventory: ['id'], stone_master: ['id'], fsm_step2: ['id'],
};

/* Columns that should be coerced to a JS number on read (so `!!active`,
   numeric sorts, and arithmetic behave like MySQL — sheets store strings). */
export const INT_COLUMNS = {
  users: ['active'],
  daily_tasks: ['minutes'],
  fms_sheets: ['header_row'],
  fms_sheet_steps: ['step_order'],
  fms_extra_rows: ['required'],
};

export const TABLE_NAMES = Object.keys(SCHEMAS);

/* ── auth ──────────────────────────────────────────────────────────────── */
let _sheets = null;
function sheetsApi() {
  if (_sheets) return _sheets;
  const { client_email, private_key } = requireGoogleCredentials();
  if (!SPREADSHEET_ID) throw new Error('SHEETS_DB_ID not set');
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

export function isSheetsConfigured() {
  return !!(SPREADSHEET_ID && haveCredentials());
}

/* ── cache ─────────────────────────────────────────────────────────────── */
const g = globalThis;
if (!g.__sheetsCache) g.__sheetsCache = { tables: null, loadedAt: 0 };
const CACHE_TTL_MS = 800;

// Retry Google API calls on rate-limit / transient errors with backoff.
async function withRetry(fn, label = 'sheets') {
  const delays = [500, 1200, 2500, 5000, 9000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try { return await fn(); }
    catch (err) {
      const code = err?.code || err?.response?.status;
      const retryable = code === 429 || code === 503 || code === 500;
      if (!retryable || attempt === delays.length) { lastErr = err; break; }
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}

function colLetter(n) {
  // 0-based index -> A, B, ... Z, AA ...
  let s = '';
  n += 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function rowsToObjects(table, values) {
  // values: array of arrays from sheet (incl header row). Map data rows to objects.
  const headers = SCHEMAS[table];
  const ints = INT_COLUMNS[table] || [];
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const raw = values[i] || [];
    // skip fully-empty rows
    if (raw.every((c) => c === '' || c === null || c === undefined)) continue;
    const obj = {};
    headers.forEach((h, ci) => {
      let v = raw[ci];
      if (v === undefined || v === null) v = '';
      if (ints.includes(h)) {
        if (v === '') v = null;
        else if (/^true$/i.test(v)) v = 1;       // legacy boolean cells
        else if (/^false$/i.test(v)) v = 0;
        else v = Number(v);
      }
      obj[h] = v;
    });
    out.push(obj);
  }
  return out;
}

/* Ensure every tab exists and its header row is correct. Runs once per cold
   start (tracked via a global flag). */
export async function ensureTabs() {
  if (g.__sheetsTabsReady) return g.__sheetsTabsReady;
  g.__sheetsTabsReady = (async () => {
    const sheets = sheetsApi();
    const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }), 'meta');
    const existing = new Set((meta.data.sheets || []).map((s) => s.properties.title));
    const toCreate = TABLE_NAMES.filter((t) => !existing.has(t));
    if (toCreate.length) {
      await withRetry(() => sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })) },
      }), 'addSheets');
    }
    // Write/refresh header rows for all tables in one batch.
    await withRetry(() => sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: TABLE_NAMES.map((t) => ({
          range: `${t}!A1:${colLetter(SCHEMAS[t].length - 1)}1`,
          values: [SCHEMAS[t]],
        })),
      },
    }), 'headers');
  })().catch((e) => { g.__sheetsTabsReady = null; throw e; });
  return g.__sheetsTabsReady;
}

/* Load all tabs into the cache (single batchGet). Honours a short TTL so
   multiple queries inside one request reuse the same snapshot. */
export async function loadAll(force = false) {
  const now = Date.now();
  if (!force && g.__sheetsCache.tables && now - g.__sheetsCache.loadedAt < CACHE_TTL_MS) {
    return g.__sheetsCache.tables;
  }
  await ensureTabs();
  const sheets = sheetsApi();
  const ranges = TABLE_NAMES.map((t) => `${t}!A1:${colLetter(SCHEMAS[t].length - 1)}`);
  const res = await withRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges }), 'batchGet');
  const tables = {};
  (res.data.valueRanges || []).forEach((vr, i) => {
    const t = TABLE_NAMES[i];
    tables[t] = rowsToObjects(t, vr.values || []);
  });
  g.__sheetsCache = { tables, loadedAt: now };
  return tables;
}

/* Current cached tables (assumes loadAll already ran in this request path). */
export async function getTables() {
  if (!g.__sheetsCache.tables) await loadAll();
  return g.__sheetsCache.tables;
}

/* Write one table's rows back to the sheet (header stays, data replaced).
   Single API call: we pad with blank rows up to the high-water row count so a
   plain update overwrites any previously-written rows that are now gone — no
   separate clear() call (halves API usage, important for rate limits). */
if (!g.__sheetsHighWater) g.__sheetsHighWater = {};
export async function flushTable(table) {
  const sheets = sheetsApi();
  const headers = SCHEMAS[table];
  const rows = (g.__sheetsCache.tables?.[table]) || [];

  const values = rows.map((r) => headers.map((h) => {
    const v = r[h];
    return v === null || v === undefined ? '' : v;
  }));

  const prev = g.__sheetsHighWater[table] || 0;
  const blankRow = headers.map(() => '');
  while (values.length < prev) values.push(blankRow.slice());
  g.__sheetsHighWater[table] = Math.max(prev, rows.length);

  if (values.length === 0) return; // nothing ever written
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${table}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values },
  }), `flush:${table}`);
  // We just wrote the cache to the sheet, so the cache IS authoritative —
  // keep it "fresh" to avoid an immediate re-read on the next query.
  g.__sheetsCache.loadedAt = Date.now();
}

export async function flushTables(tableSet) {
  for (const t of tableSet) await flushTable(t);
}

export function invalidateCache() {
  g.__sheetsCache = { tables: g.__sheetsCache.tables, loadedAt: 0 };
}

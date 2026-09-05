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
import { getGoogleCredentials, getSheetsClient } from './googleCreds.js';

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
  // NOTE (every table here): columns are positional — the app reads/writes by
  // index against this list, so new columns must be APPENDED, never inserted.
  // A column present in lib/db.js but absent here is silently dropped on write
  // and undefined on read (users.branch was lost this way for weeks).
  users: ['id', 'name', 'email', 'phone', 'department', 'roles', 'active', 'password_hash', 'picture', 'force_logout_after', 'created_at', 'access', 'branch'],
  delegations: ['id', 'description', 'doer_id', 'doer', 'delegated_by', 'due_date', 'client', 'status', 'type', 'priority', 'approval', 'approver_id', 'approver', 'url', 'remarks', 'revise_action', 'transferred_by', 'transferred_from', 'created_at', 'completed_at', 'image', 'require_file', 'attachment', 'completion_file'],
  masters: ['id', 'task', 'assigned_to', 'frequency', 'start_date', 'created_at', 'require_file', 'attachment'],
  holidays: ['id', 'date', 'name', 'type'],
  // FMS — sheet-config tables. The Google Sheet each fms_sheets row points at
  // stays the live source of truth; these only store which columns to read/write.
  fms_sheets: ['id', 'fms_name', 'sheet_name', 'sheet_id', 'header_row', 'created_by', 'created_at', 'process_coordinator_id', 'intake_sheet_id', 'intake_sheet_name', 'intake_header_row', 'intake_form_name'],
  fms_sheet_steps: ['id', 'fms_id', 'step_order', 'step_name', 'plan_col', 'actual_col', 'extra_input', 'extra_col', 'show_cols', 'delay_reason_col', 'doer_name_col', 'open_url'],
  fms_step_doers: ['step_id', 'user_id'],
  fms_extra_rows: ['id', 'step_id', 'row_label', 'col_letter', 'field_type', 'dropdown_options', 'required', 'depends_on', 'depends_value'],
  fms_intake_fields: ['id', 'fms_id', 'field_label', 'col_letter', 'field_type', 'dropdown_options', 'required', 'sort_order', 'auto_fill', 'auto_fill_value', 'depends_on', 'depends_value', 'unique_value'],
  live_trackers: ['id', 'name', 'sheet_id', 'sheet_name', 'header_row', 'created_by', 'created_at', 'start_row'],
  profile: ['user_id', 'notification_email'],
  app_config: ['key', 'value'],
  checklist_completions: ['id', 'master_id', 'doer', 'completed_at', 'date', 'file'],
  meetings: ['id', 'title', 'meeting_date', 'start_time', 'end_time', 'attendees', 'notes', 'created_by', 'created_at'],
  leaves: ['id', 'user_id', 'user_name', 'type', 'from_date', 'to_date', 'reason', 'status', 'approver', 'created_at', 'decided_at'],
  // NOTE: new columns must be APPENDED (reads/writes are positional against
  // this list, and ensureTabs refreshes the header row from it). The tail
  // mirrors the MySQL ALTERs in lib/db.js: SE/Sales columns, then the EA
  // Walk-in + Sales Payment report columns.
  daily_tasks: ['id', 'entry_date', 'doer_id', 'doer', 'client', 'department', 'description', 'minutes', 'created_at', 'order_number', 'area_name', 'task_type', 'software', 'revision',
    'client_number', 'site_location', 'purpose_of_visit', 'checks_type', 'kms_travelled', 'branch', 'pre_install_image', 'pre_install_comment',
    'arc_name', 'arc_phone', 'old_new_client', 'no_of_visits', 'remarks',
    'order_value', 'adv_paid', 'balance', 'mode_of_pay', 'executive', 'till_date_received', 'balance_target'],
  clients: ['id', 'name', 'contact_person', 'contact_number', 'email', 'industry', 'status', 'notes', 'created_at'],
  dev_backups: ['id', 'label', 'data', 'created_at', 'expires_at'],
  quotations: ['id', 'ref_no', 'branch', 'client_name', 'client_firm', 'client_contact', 'client_email', 'pan', 'architect_name', 'architect_firm', 'architect', 'consultant', 'consultant_number', 'consultant_email', 'boutique', 'payment_terms', 'validity', 'lead_time', 'transport', 'billing_address', 'site_address', 'grand_total', 'discount_pct', 'design_fees', 'installation_charges', 'packing_charges', 'stone_items', 'totals_config', 'fixing_items', 'pdf', 'created_at', 'status', 'created_by_id', 'created_by_name', 'approval_token', 'approved_by', 'approved_at', 'quote_date'],
  consultants: ['name', 'mobile', 'email'],
  inventory: ['id', 'created_at', 'inv_key', 'slab', 'block', 'material', 'thickness', 'size_l', 'size_w', 'sft', 'slab_photo', 'status', 'updated_at', 'order_no', 'client', 'area', 'cutting', 'cutting_reason', 'cutting_size_l', 'cutting_size_w', 'remarks'],
  stone_master: ['id', 'material', 'thickness'],
  fsm_step2: ['id', 'inv_key', 'created_at', 'order_no', 'material', 'all_pieces', 'grain', 'grain_img', 'issue', 'cutting_required', 'mat_img', 'sizes_packing'],
  // Factory production report — one block per department, one row per worker.
  production_departments: ['id', 'name', 'sort_order', 'has_shifts', 'fields', 'active', 'created_at'],
  production_entries: ['id', 'entry_date', 'department_id', 'department', 'shift', 's_no', 'worker', 'helper', 'order_number', 'hours', 'area', 'material', 'material_qty', 'work', 'machine_number', 'remarks', 'created_by', 'created_at', 'updated_at'],
  production_notes: ['id', 'entry_date', 'department_id', 'shift', 'note'],
  // Help tickets — the internal issue queue (see lib/helpTickets.js). Columns
  // mirror the MySQL table in lib/db.js, in the same order.
  help_tickets: ['id', 'subject', 'description', 'category', 'priority', 'status', 'raised_by_id', 'assigned_to_id', 'due_date', 'resolved_at', 'created_at', 'updated_at'],
  help_ticket_events: ['id', 'ticket_id', 'actor_id', 'kind', 'body', 'created_at'],
};

/* Primary key column(s) per table — used for ON DUPLICATE KEY / upserts. */
export const PRIMARY_KEYS = {
  users: ['id'], delegations: ['id'], masters: ['id'], holidays: ['id'],
  fms_sheets: ['id'], fms_sheet_steps: ['id'], fms_step_doers: ['step_id', 'user_id'],
  fms_extra_rows: ['id'], fms_intake_fields: ['id'], live_trackers: ['id'], profile: ['user_id'],
  app_config: ['key'], checklist_completions: ['id'], meetings: ['id'],
  leaves: ['id'], daily_tasks: ['id'], clients: ['id'], dev_backups: ['id'],
  quotations: ['id'], consultants: ['name'],
  inventory: ['id'], stone_master: ['id'], fsm_step2: ['id'],
  production_departments: ['id'], production_entries: ['id'],
  // Upserted by (date, department, shift) — that triple is what a note belongs to.
  production_notes: ['entry_date', 'department_id', 'shift'],
  help_tickets: ['id'], help_ticket_events: ['id'],
};

/* Columns that should be coerced to a JS number on read (so `!!active`,
   numeric sorts, and arithmetic behave like MySQL — sheets store strings). */
const INT_COLUMNS = {
  users: ['active'],
  daily_tasks: ['minutes', 'kms_travelled', 'no_of_visits', 'order_value', 'adv_paid', 'balance', 'till_date_received', 'balance_target'],
  fms_sheets: ['header_row'],
  fms_sheet_steps: ['step_order'],
  fms_extra_rows: ['required'],
  live_trackers: ['header_row', 'start_row'],
  production_departments: ['sort_order', 'has_shifts', 'active'],
  production_entries: ['s_no', 'hours'],
};

const TABLE_NAMES = Object.keys(SCHEMAS);

/* ── auth ──────────────────────────────────────────────────────────────── */
function sheetsApi() {
  if (!SPREADSHEET_ID) throw new Error('SHEETS_DB_ID not set');
  return getSheetsClient();
}

export function isSheetsConfigured() {
  return !!(SPREADSHEET_ID && haveCredentials());
}

/* ── cache ─────────────────────────────────────────────────────────────── */
const g = globalThis;
if (!g.__sheetsCache) g.__sheetsCache = { tables: null, loadedAt: 0, inflight: null };
// Per-table high-water row count (see flushTable / loadAll).
if (!g.__sheetsHighWater) g.__sheetsHighWater = {};
// 5s: every batchGet pulls all 28 tabs (images, PDFs, backups included), so
// each cache miss costs a full spreadsheet download. Cross-process staleness
// is unbounded anyway (PM2 runs 2 cluster instances that don't share this
// cache), so a longer TTL trades nothing that isn't already traded.
const CACHE_TTL_MS = 5000;

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
export async function loadAll(force = false, maxAgeMs = CACHE_TTL_MS) {
  const now = Date.now();
  if (!force && g.__sheetsCache.tables && now - g.__sheetsCache.loadedAt < maxAgeMs) {
    return g.__sheetsCache.tables;
  }
  // Concurrent misses share ONE download. Without this, two requests landing
  // together (the sidebar fires two endpoints in parallel on every page) each
  // pulled the whole spreadsheet on their own.
  if (!force && g.__sheetsCache.inflight) return g.__sheetsCache.inflight;

  const load = (async () => {
    await ensureTabs();
    const sheets = sheetsApi();
    const ranges = TABLE_NAMES.map((t) => `${t}!A1:${colLetter(SCHEMAS[t].length - 1)}`);
    const res = await withRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges }), 'batchGet');
    const tables = {};
    (res.data.valueRanges || []).forEach((vr, i) => {
      const t = TABLE_NAMES[i];
      const values = vr.values || [];
      tables[t] = rowsToObjects(t, values);
      // How far down the tab data actually reaches (blank rows included).
      // flushTable() pads its rewrite up to this mark so rows it dropped are
      // cleared; seeding it from the sheet means a freshly restarted process
      // (or the other PM2 instance) can no longer leave a deleted tail row
      // behind because it "never wrote that far".
      g.__sheetsHighWater[t] = Math.max(g.__sheetsHighWater[t] || 0, values.length - 1);
    });
    g.__sheetsCache = { tables, loadedAt: Date.now(), inflight: null };
    return tables;
  })();

  load.catch(() => {}); // sharers handle their own rejection; avoid an unhandled-rejection warning
  g.__sheetsCache.inflight = load;
  try {
    return await load;
  } finally {
    if (g.__sheetsCache.inflight === load) g.__sheetsCache.inflight = null;
  }
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

/* Append rows to a tab WITHOUT rewriting the rows already there. Plain
   INSERTs go through here instead of flushTable(): the two PM2 cluster
   instances each hold their own cache, so a full rewrite from one of them
   silently dropped whatever the other had inserted in the last few seconds
   (daily-task submissions vanished this way). Google appends after the last
   non-empty row of the tab, so the padding rows flushTable() leaves behind
   are skipped, and the response tells us where the rows actually landed. */
export async function appendRows(table, rows) {
  if (!rows.length) return;
  const sheets = sheetsApi();
  const headers = SCHEMAS[table];
  const values = rows.map((r) => headers.map((h) => {
    const v = r[h];
    return v === null || v === undefined ? '' : v;
  }));
  const res = await withRetry(() => sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${table}!A1:${colLetter(headers.length - 1)}`,
    valueInputOption: 'RAW',
    insertDataOption: 'OVERWRITE',
    requestBody: { values },
  }), `append:${table}`);
  // updatedRange looks like "daily_tasks!A120:AH121" — the last row number is
  // where the sheet's data now ends, which is the padding high-water mark a
  // later full rewrite from this process has to clear up to.
  const mm = String(res.data?.updates?.updatedRange || '').match(/(\d+)$/);
  if (mm) g.__sheetsHighWater[table] = Math.max(g.__sheetsHighWater[table] || 0, Number(mm[1]) - 1);
}

export function invalidateCache() {
  g.__sheetsCache = { tables: g.__sheetsCache.tables, loadedAt: 0 };
}

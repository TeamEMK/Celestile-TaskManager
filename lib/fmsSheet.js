/**
 * FMS — live Google Sheet read/write + config-table queries.
 *
 * Unlike the app's own "database" (lib/sheets-client.js, one fixed
 * spreadsheet), FMS points at whatever external Google Sheet the admin
 * configures per fms_sheets row. That sheet stays the real source of truth:
 * we only read pending rows from it and write the Actual/done cell back into
 * it — nothing about task data is copied into our own DB.
 *
 * The sheets-DB SQL engine (lib/sql-sheets.js) has no JOIN support, so every
 * multi-table lookup here is a separate query + in-memory join.
 */
import { google } from 'googleapis';
import { pool, ensureSchema } from '@/lib/db';
import { requireGoogleCredentials } from '@/lib/googleCreds';
import { maybeUploadToDrive } from '@/lib/googleDrive';

/* ── auth + low-level sheet I/O ──────────────────────────────────────── */

let _sheets = null;
function getSheetsRW() {
  if (_sheets) return _sheets;
  const { client_email, private_key } = requireGoogleCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

export function fmsServiceAccountEmail() {
  return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
}

export function extractSpreadsheetId(urlOrId) {
  if (!urlOrId) return null;
  const m = String(urlOrId).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : String(urlOrId).trim();
}

export function colToIdx(letter) {
  const s = String(letter || '').trim().toUpperCase();
  if (!s) return -1;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) - 64;
    if (c < 1 || c > 26) return -1;
    n = n * 26 + c;
  }
  return n - 1;
}

export function idxToCol(idx) {
  let n = idx + 1, s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Header row only — fast, for populating column pickers in the admin UI.
export async function fetchHeaders(sheetUrlOrId, tabName, headerRow) {
  const sheets = getSheetsRW();
  const spreadsheetId = extractSpreadsheetId(sheetUrlOrId);
  const hRow = parseInt(headerRow) || 1;
  const range = tabName ? `${tabName}!${hRow}:${hRow}` : `${hRow}:${hRow}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range, majorDimension: 'ROWS', valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const raw = (res.data.values || [[]])[0] || [];
  return raw
    .map((h, i) => ({ name: String(h ?? '').trim() || `COL_${idxToCol(i)}`, col: idxToCol(i), index: i }))
    .filter((h) => String(h.name).trim().length > 0);
}

// Generic range read (e.g. `${tabName}!A:${lastCol}`) — full column data.
export async function fetchRange(sheetUrlOrId, range) {
  const sheets = getSheetsRW();
  const spreadsheetId = extractSpreadsheetId(sheetUrlOrId);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

// Single-cell write (used for Actual timestamp / delay reason / extra fields / doer name).
export async function writeCell(sheetUrlOrId, tabName, colLetter, rowNumber, value) {
  if (!colLetter || !rowNumber) return;
  const sheets = getSheetsRW();
  const spreadsheetId = extractSpreadsheetId(sheetUrlOrId);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!${colLetter.toUpperCase()}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
}

// Parse plan-column values that look like dates: DD-MM-YYYY, DD/MM/YYYY,
// YYYY-MM-DD, with an optional trailing time. Returns YYYY-MM-DD or null.
export function parsePlanDate(val) {
  if (!val) return null;
  const v = String(val).trim();
  let m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    const dt = new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`);
    return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
  }
  m = v.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    const dt = new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`);
    return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
  }
  return null;
}

function fullTimestampIST() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(ist.getUTCDate())}/${pad(ist.getUTCMonth() + 1)}/${ist.getUTCFullYear()} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`;
}

/* ── config-table queries (no JOINs — separate queries + JS-side joins) ── */

export async function listFmsSheets() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM fms_sheets ORDER BY created_at DESC');
  return rows;
}

export async function getFmsSheet(id) {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM fms_sheets WHERE id = ?', [id]);
  return rows[0] || null;
}

async function stepDoersMap(stepIds) {
  if (!stepIds.length) return {};
  const [rows] = await pool.query(
    `SELECT step_id, user_id FROM fms_step_doers WHERE step_id IN (${stepIds.map(() => '?').join(',')})`,
    stepIds
  );
  if (!rows.length) return {};
  const [users] = await pool.query('SELECT id, name FROM users');
  const nameById = {};
  users.forEach((u) => { nameById[u.id] = u.name; });
  const map = {};
  rows.forEach((r) => {
    if (!map[r.step_id]) map[r.step_id] = [];
    map[r.step_id].push({ user_id: r.user_id, name: nameById[r.user_id] || r.user_id });
  });
  return map;
}

async function stepExtraRowsMap(stepIds) {
  if (!stepIds.length) return {};
  const [rows] = await pool.query(
    `SELECT * FROM fms_extra_rows WHERE step_id IN (${stepIds.map(() => '?').join(',')})`,
    stepIds
  );
  const map = {};
  rows.forEach((r) => {
    if (!map[r.step_id]) map[r.step_id] = [];
    map[r.step_id].push(r);
  });
  return map;
}

// Raw steps for one FMS (no doers/extraRows attached).
async function rawSteps(fmsId) {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM fms_sheet_steps WHERE fms_id = ? ORDER BY step_order ASC', [fmsId]);
  return rows;
}

// Full step detail (doers + extraRows + show_cols_parsed), for admin edit / task views.
export async function getFullSteps(fmsId) {
  const steps = await rawSteps(fmsId);
  if (!steps.length) return [];
  const stepIds = steps.map((s) => s.id);
  const [doersMap, extraMap] = await Promise.all([stepDoersMap(stepIds), stepExtraRowsMap(stepIds)]);
  return steps.map((s) => ({
    ...s,
    doers: doersMap[s.id] || [],
    extraRows: extraMap[s.id] || [],
    show_cols_parsed: (() => { try { return JSON.parse(s.show_cols || '[]'); } catch { return []; } })(),
  }));
}

function nextStepId(i) { return 'STP' + Date.now() + '_' + i; }
function nextExtraId(stepId, i) { return stepId + '_ER' + i; }

// Create a sheet + its steps + doers + extraRows in one call.
export async function createFmsSheet({ fmsName, sheetName, sheetId, headerRow, createdBy, steps, processCoordinatorId }) {
  await ensureSchema();
  const id = 'FMS' + Date.now();
  await pool.query(
    'INSERT INTO fms_sheets (id, fms_name, sheet_name, sheet_id, header_row, created_by, created_at, process_coordinator_id) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)',
    [id, fmsName || sheetName || '', sheetName || '', sheetId || '', headerRow || 1, createdBy || null, processCoordinatorId || null]
  );
  await writeSteps(id, steps || []);
  return id;
}

export async function updateFmsSheet(id, { fmsName, sheetName, sheetId, headerRow, steps, processCoordinatorId }) {
  await ensureSchema();
  await pool.query(
    'UPDATE fms_sheets SET fms_name = ?, sheet_name = ?, sheet_id = ?, header_row = ?, process_coordinator_id = ? WHERE id = ?',
    [fmsName || sheetName || '', sheetName || '', sheetId || '', headerRow || 1, processCoordinatorId || null, id]
  );
  // Replace all steps (delete + recreate is far simpler than diffing given the sheets-DB engine has no JOIN/CASCADE).
  const oldSteps = await rawSteps(id);
  for (const s of oldSteps) {
    await pool.query('DELETE FROM fms_step_doers WHERE step_id = ?', [s.id]);
    await pool.query('DELETE FROM fms_extra_rows WHERE step_id = ?', [s.id]);
    await pool.query('DELETE FROM fms_sheet_steps WHERE id = ?', [s.id]);
  }
  await writeSteps(id, steps || []);
}

async function writeSteps(fmsId, steps) {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const stepId = nextStepId(i);
    await pool.query(
      `INSERT INTO fms_sheet_steps
        (id, fms_id, step_order, step_name, plan_col, actual_col, extra_input, extra_col, show_cols, delay_reason_col, doer_name_col)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        stepId, fmsId, i + 1, s.stepName || `Step ${i + 1}`,
        s.planCol || '', s.actualCol || '', s.extraInput || 'no', s.extraCol || '',
        JSON.stringify(s.showCols || []), s.delayReasonCol || '', s.doerNameCol || '',
      ]
    );
    for (const uid of s.doers || []) {
      await pool.query('INSERT INTO fms_step_doers (step_id, user_id) VALUES (?, ?)', [stepId, String(uid)]);
    }
    const extraRows = (s.extraInput === 'yes' && s.extraRows?.length) ? s.extraRows : [];
    for (let ri = 0; ri < extraRows.length; ri++) {
      const r = extraRows[ri];
      if (!r.col_letter && !r.colLetter) continue;
      await pool.query(
        'INSERT INTO fms_extra_rows (id, step_id, row_label, col_letter, field_type, dropdown_options, required) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          nextExtraId(stepId, ri), stepId, r.label || r.row_label || r.col_letter || r.colLetter || '',
          r.col_letter || r.colLetter || '', r.field_type || 'text', r.dropdown_options || '',
          (r.required === false || r.required === 0 || r.required === '0') ? 0 : 1,
        ]
      );
    }
  }
}

export async function deleteFmsSheet(id) {
  await ensureSchema();
  const steps = await rawSteps(id);
  for (const s of steps) {
    await pool.query('DELETE FROM fms_step_doers WHERE step_id = ?', [s.id]);
    await pool.query('DELETE FROM fms_extra_rows WHERE step_id = ?', [s.id]);
  }
  await pool.query('DELETE FROM fms_sheet_steps WHERE fms_id = ?', [id]);
  await pool.query('DELETE FROM fms_intake_fields WHERE fms_id = ?', [id]);
  await pool.query('DELETE FROM fms_sheets WHERE id = ?', [id]);
}

/* ── intake form config (the "starting form" that creates a new row) ──── */

function nextIntakeFieldId(fmsId, i) { return fmsId + '_IF' + i; }

export async function getIntakeFields(fmsId) {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM fms_intake_fields WHERE fms_id = ? ORDER BY sort_order ASC', [fmsId]);
  return rows;
}

// Replace all intake fields for one FMS (delete + recreate, same convention as writeSteps).
export async function saveIntakeFields(fmsId, fields) {
  await ensureSchema();
  await pool.query('DELETE FROM fms_intake_fields WHERE fms_id = ?', [fmsId]);
  const rows = (fields || []).filter((f) => f.col_letter || f.colLetter);
  for (let i = 0; i < rows.length; i++) {
    const f = rows[i];
    await pool.query(
      'INSERT INTO fms_intake_fields (id, fms_id, field_label, col_letter, field_type, dropdown_options, required, sort_order, auto_fill, auto_fill_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        nextIntakeFieldId(fmsId, i), fmsId,
        f.field_label || f.label || f.col_letter || f.colLetter || '',
        f.col_letter || f.colLetter || '', f.field_type || 'text', f.dropdown_options || '',
        (f.required === false || f.required === 0 || f.required === '0') ? 0 : 1,
        i,
        f.auto_fill || '', f.auto_fill_value || '',
      ]
    );
  }
}

// The intake form can target a different sheet/tab/header-row than the FMS's
// own tracking sheet (e.g. a separate "New Leads" tab or spreadsheet) — set
// via the Intake Form config modal. Falls back to the FMS's own sheet when
// no override is configured, so existing FMS's keep working unchanged.
export async function saveIntakeSheetConfig(fmsId, { sheetId, sheetName, headerRow, formName }) {
  await ensureSchema();
  await pool.query(
    'UPDATE fms_sheets SET intake_sheet_id = ?, intake_sheet_name = ?, intake_header_row = ?, intake_form_name = ? WHERE id = ?',
    [sheetId || '', sheetName || '', headerRow || null, formName || '', fmsId]
  );
}

export function effectiveIntakeSheet(sheet) {
  return {
    sheet_id: sheet.intake_sheet_id || sheet.sheet_id,
    sheet_name: sheet.intake_sheet_name || sheet.sheet_name,
    header_row: sheet.intake_header_row || sheet.header_row || 1,
  };
}

// Unique values from one column of a live sheet, matched against `users` by
// case-insensitive exact name — powers "Load Doers" in the step config.
export async function sheetColumnValues(sheetUrlOrId, tabName, colLetter, headerRow) {
  const colIdx = colToIdx(colLetter);
  if (colIdx < 0) throw new Error('Invalid column letter');
  const values = await fetchRange(sheetUrlOrId, `${tabName}!${colLetter}:${colLetter}`);
  const headerIdx = (parseInt(headerRow) || 1) - 1;
  const uniqueNames = [...new Set(values.slice(headerIdx + 1).map((r) => (r[0] || '').trim()).filter(Boolean))];

  await ensureSchema();
  const [allUsers] = await pool.query('SELECT id, name, email FROM users');
  const matched = [], unmatched = [];
  for (const sheetName of uniqueNames) {
    const user = allUsers.find((u) => (u.name || '').trim().toLowerCase() === sheetName.toLowerCase());
    if (user) matched.push({ sheet_name: sheetName, user_id: user.id, user_name: user.name, email: user.email });
    else unmatched.push(sheetName);
  }
  return { total_unique: uniqueNames.length, matched, unmatched, all_unique: uniqueNames };
}

/* ── task-side: live pending rows + Done write-back ─────────────────── */

// FMS sheets visible to a user: admin sees all, everyone else only sheets
// where they're a doer on at least one step.
export async function getFmsSheetsForUser(userId, isAdmin) {
  const all = await listFmsSheets();
  if (isAdmin) return all;
  if (!all.length) return [];
  // No JOIN support — resolve step_id -> fms_id as two queries + in-memory filter.
  const [myDoerRows] = await pool.query('SELECT step_id FROM fms_step_doers WHERE user_id = ?', [String(userId)]);
  if (!myDoerRows.length) return [];
  const myStepIds = new Set(myDoerRows.map((r) => r.step_id));
  const [allSteps] = await pool.query('SELECT id, fms_id FROM fms_sheet_steps');
  const myFmsIds = new Set(allSteps.filter((s) => myStepIds.has(s.id)).map((s) => s.fms_id));
  return all.filter((f) => myFmsIds.has(f.id));
}

// FMS list + stats for the FMS page: total steps, total entries, total
// pending (across every step), and the resolved Process Coordinator name.
// One range fetch per sheet — reused for both counts, same "fetch once"
// approach as computePendingRows's other callers.
export async function getFmsSheetsWithStats(userId, isAdmin) {
  const sheets = await getFmsSheetsForUser(userId, isAdmin);
  if (!sheets.length) return [];
  await ensureSchema();
  const [users] = await pool.query('SELECT id, name FROM users');
  const nameById = {};
  users.forEach((u) => { nameById[u.id] = u.name; });

  return Promise.all(sheets.map(async (sheet) => {
    const steps = await getFullSteps(sheet.id);
    let totalEntries = 0, totalPending = 0;
    try {
      const allRows = await fetchRange(sheet.sheet_id, `${sheet.sheet_name}!A:${lastColForSteps(steps)}`);
      const headerIdx = (sheet.header_row || 1) - 1;
      totalEntries = allRows.slice(headerIdx + 1).filter((r) => (r[0] || '').toString().trim()).length;
      totalPending = steps.reduce((sum, step) => sum + computePendingRows(allRows, sheet, step, '', true).rows.length, 0);
    } catch { /* sheet unreachable — show zeros rather than fail the whole list */ }
    return {
      ...sheet,
      totalSteps: steps.length,
      totalEntries,
      totalPending,
      coordinatorName: nameById[sheet.process_coordinator_id] || '',
    };
  }));
}

// Steps for one FMS, each tagged with isMyStep (admin = always true).
export async function getStepsForTaskView(fmsId, userId, isAdmin) {
  const steps = await getFullSteps(fmsId);
  return steps.map((s) => ({
    ...s,
    isMyStep: isAdmin || s.doers.some((d) => String(d.user_id) === String(userId)),
  }));
}

const blankClean = (v) => (v || '').toString().replace(/[\s​-‍﻿]+/g, '');

// Widest column any of the given steps reads/writes — used to size a single
// range fetch that covers every one of them (mirrors getFmsMisRows/
// getFmsPendingGroupedByDoer's existing "one fetch per sheet" pattern).
function lastColForSteps(steps) {
  const idxs = steps.flatMap((s) => [
    colToIdx(s.plan_col), colToIdx(s.actual_col),
    s.doer_name_col ? colToIdx(s.doer_name_col) : -1,
    ...(s.show_cols_parsed || []),
  ]).filter((x) => x >= 0);
  return idxs.length ? idxToCol(Math.max(...idxs)) : 'Z';
}

// Pure computation over already-fetched sheet data (Plan filled + Actual
// empty, doer-filtered for non-admins) — split out so callers that need
// every step of a sheet can fetch the range ONCE and reuse it, instead of
// one live Sheets call per step.
function computePendingRows(allRows, sheet, step, userName, isAdmin) {
  const planIdx   = colToIdx(step.plan_col);
  const actualIdx = colToIdx(step.actual_col);
  const doerIdx   = step.doer_name_col ? colToIdx(step.doer_name_col) : -1;
  let showCols = step.show_cols_parsed || [];

  const headerRowIdx = (sheet.header_row || 1) - 1;
  const headers = allRows[headerRowIdx] || [];
  const dataRows = allRows.slice(headerRowIdx + 1);

  const myName = (userName || '').trim().toLowerCase();
  const applyDoerFilter = !isAdmin && doerIdx >= 0 && myName;

  const matchedRows = [];
  let totalPending = 0, assignedToMe = 0;
  dataRows.forEach((row, i) => {
    const planVal   = planIdx >= 0 ? (row[planIdx] || '').trim() : '';
    const actualVal = actualIdx >= 0 ? (row[actualIdx] || '').trim() : '';
    if (!blankClean(planVal) || blankClean(actualVal)) return;
    totalPending++;

    const rowDoer = doerIdx >= 0 ? (row[doerIdx] || '').trim() : '';
    const isMine = rowDoer.toLowerCase() === myName;
    if (isMine) assignedToMe++;
    if (applyDoerFilter && !isMine) return;

    const rowData = {};
    let colsToShow = showCols.length ? showCols : headers.map((_, hi) => hi);
    if (planIdx >= 0 && !colsToShow.includes(planIdx)) colsToShow = [planIdx, ...colsToShow];
    colsToShow.forEach((ci) => { rowData[headers[ci] || `COL ${idxToCol(ci)}`] = row[ci] || ''; });

    matchedRows.push({
      sheetRowNumber: headerRowIdx + 1 + i + 1,
      planValue: planVal, actualValue: actualVal,
      rowDoerName: rowDoer, isMine, data: rowData,
    });
  });

  return {
    rows: matchedRows, headers, total: matchedRows.length, totalPending, assignedToMe,
    filtered: applyDoerFilter, doerColumn: step.doer_name_col || null, isAdmin,
  };
}

// Live pending rows for one step — fetches just that step's columns. Prefer
// computePendingRows() directly (with a range already fetched once for every
// step of the sheet) when processing more than one step at a time.
export async function getPendingRowsForStep({ sheet, step, userName, isAdmin }) {
  const lastCol = lastColForSteps([step]);
  const allRows = await fetchRange(sheet.sheet_id, `${sheet.sheet_name}!A:${lastCol}`);
  return computePendingRows(allRows, sheet, step, userName, isAdmin);
}

// Pending rows across every step of one FMS (FMS Tracker's "PC View" — a
// monitoring overview, not filtered to one doer/step). One range fetch for
// the whole sheet, reused across all its steps.
export async function getPendingAcrossSteps(fmsId) {
  const sheet = await getFmsSheet(fmsId);
  if (!sheet) return [];
  const steps = await getFullSteps(fmsId);
  if (!steps.length) return [];
  let allRows;
  try { allRows = await fetchRange(sheet.sheet_id, `${sheet.sheet_name}!A:${lastColForSteps(steps)}`); } catch { return []; }

  const items = [];
  for (const step of steps) {
    const result = computePendingRows(allRows, sheet, step, '', true);
    result.rows.forEach((row) => {
      items.push({
        stepName: step.step_name,
        doer: row.rowDoerName || step.doers.map((d) => d.name).join(', ') || '—',
        plannedDate: parsePlanDate(row.planValue) || '',
        planValue: row.planValue,
        data: row.data,
      });
    });
  }
  items.sort((a, b) => (a.plannedDate || '9999').localeCompare(b.plannedDate || '9999'));
  return items;
}

// Fields with `auto_fill` set need no manual input — the submit form doesn't
// render them at all, so their value always comes from here instead of the
// client's `values` map.
function resolveAutoFill(field, userName) {
  if (field.auto_fill === 'timestamp') return fullTimestampIST();
  if (field.auto_fill === 'user_name') return userName || '';
  if (field.auto_fill === 'fixed')     return field.auto_fill_value || '';
  return null;
}

// Serializes submitIntakeRow() calls per sheet+tab so two people submitting
// the intake form seconds apart in the SAME Node process never compute the
// same "next empty row" at once. Runs per PM2 instance (production runs 2 in
// cluster mode), so it's paired with a re-check-before-write below to also
// cover the cross-process case.
const _sheetLocks = new Map();
function withSheetLock(key, fn) {
  const run = (_sheetLocks.get(key) || Promise.resolve()).then(fn, fn);
  _sheetLocks.set(key, run.catch(() => {}));
  return run;
}

// Next row = one past the last row that already has data in any of the
// configured intake columns — checked directly instead of relying on
// Sheets' own table autodetection (which also treats pre-filled formula
// cells as "data" and would push the new entry far below where it belongs).
async function findNextIntakeRow(sheet, cellWrites, headerRow, lastCol) {
  const existingRows = await fetchRange(sheet.sheet_id, `${sheet.sheet_name}!A${headerRow + 1}:${lastCol}`);
  let lastFilledOffset = -1;
  existingRows.forEach((row, i) => {
    if (cellWrites.some((c) => (row[c.idx] || '').toString().trim())) lastFilledOffset = i;
  });
  return headerRow + 1 + lastFilledOffset + 1;
}

// Validate required fields, then write each value directly into its own
// configured cell of the next available row — one writeCell per field,
// never a whole-row array. Sheets' own append+INSERT_ROWS also counts
// pre-filled formulas (dragged down in advance of new data, a common
// spreadsheet practice) as "existing data", and writing a full-width row
// array over/around them blanked those formulas out. Touching only the
// configured cells leaves everything else in that row — formulas included —
// exactly as it was.
export async function submitIntakeRow(sheet, fields, values, { userName } = {}) {
  const missing = fields.filter((f) => !f.auto_fill && f.required && !String(values[f.id] ?? '').trim());
  if (missing.length) {
    throw new Error(`Required field${missing.length > 1 ? 's' : ''} missing: ${missing.map((f) => f.field_label || f.col_letter).join(', ')}`);
  }
  // Upload fields carry a data: URI from the client — swap it for a Drive URL
  // before it reaches the sheet (a raw base64 blob can blow past Sheets'
  // 50,000-char cell cap). maybeUploadToDrive passes non-data-URI values
  // through untouched, so this is safe to call unconditionally.
  const resolvedValues = { ...values };
  for (const f of fields) {
    if (f.field_type === 'upload' && resolvedValues[f.id]) {
      resolvedValues[f.id] = await maybeUploadToDrive(resolvedValues[f.id], 'fms-intake-upload');
    }
  }

  const cellWrites = fields
    .map((f) => {
      const idx = colToIdx(f.col_letter);
      if (idx < 0) return null;
      const auto = resolveAutoFill(f, userName);
      return { idx, colLetter: f.col_letter.toUpperCase(), value: auto !== null ? auto : (resolvedValues[f.id] ?? '') };
    })
    .filter(Boolean);
  if (!cellWrites.length) return { targetRow: null, sheetName: sheet.sheet_name, cellsWritten: 0 };

  const headerRow = parseInt(sheet.header_row) || 1;
  const lastCol = idxToCol(Math.max(...cellWrites.map((c) => c.idx)));
  const lockKey = `${sheet.sheet_id}::${sheet.sheet_name}`;

  let result;
  await withSheetLock(lockKey, async () => {
    let targetRow = await findNextIntakeRow(sheet, cellWrites, headerRow, lastCol);
    // Re-verify the row is still empty right before writing, stepping
    // forward if another submission (a different server process) just
    // claimed it — closes the race the lock above can't, since it re-reads
    // live sheet state instead of relying on in-memory ordering.
    for (let attempt = 0; attempt < 20; attempt++) {
      const check = await fetchRange(sheet.sheet_id, `${sheet.sheet_name}!A${targetRow}:${lastCol}${targetRow}`);
      const row = check[0] || [];
      const occupied = cellWrites.some((c) => (row[c.idx] || '').toString().trim());
      if (!occupied) break;
      targetRow += 1;
    }
    for (const c of cellWrites) {
      await writeCell(sheet.sheet_id, sheet.sheet_name, c.colLetter, targetRow, c.value);
    }
    // Read the row straight back — a write can report success from the API
    // yet not actually persist (e.g. a Protected Range silently rejecting the
    // service account's edit), which looks identical to a real save from here
    // otherwise. This is the only way to tell the two apart.
    const verify = await fetchRange(sheet.sheet_id, `${sheet.sheet_name}!A${targetRow}:${lastCol}${targetRow}`);
    const verifyRow = verify[0] || [];
    const mismatches = cellWrites.filter((c) => String(verifyRow[c.idx] ?? '').trim() !== String(c.value ?? '').trim());
    result = {
      targetRow, sheetName: sheet.sheet_name, cellsWritten: cellWrites.length,
      verified: mismatches.length === 0,
      mismatchCols: mismatches.map((c) => c.colLetter),
    };
  });
  return result;
}

// Write Actual timestamp (+ delay reason + extra fields + doer name) back to the sheet.
export async function writeStepDone({ sheet, step, rowNumber, delayReason, extraInputs, doerName }) {
  const actualCol = (step.actual_col || '').toUpperCase();
  if (!actualCol) throw new Error('Actual column not configured for this step');
  const actualValue = fullTimestampIST();

  await writeCell(sheet.sheet_id, sheet.sheet_name, actualCol, rowNumber, actualValue);

  if (delayReason && step.delay_reason_col) {
    await writeCell(sheet.sheet_id, sheet.sheet_name, step.delay_reason_col, rowNumber, delayReason);
  }
  for (const ei of extraInputs || []) {
    if (ei.colLetter && ei.value !== undefined && ei.value !== '') {
      const fieldCfg = (step.extraRows || []).find((r) => (r.col_letter || '').toUpperCase() === ei.colLetter.toUpperCase());
      const value = fieldCfg?.field_type === 'upload' ? await maybeUploadToDrive(ei.value, 'fms-step-upload') : ei.value;
      await writeCell(sheet.sheet_id, sheet.sheet_name, ei.colLetter, rowNumber, value);
    }
  }
  if (step.doer_name_col && doerName) {
    await writeCell(sheet.sheet_id, sheet.sheet_name, step.doer_name_col, rowNumber, doerName);
  }
  return { actualValue };
}

// Aggregator — pending rows across every sheet/step visible to a user, for
// the Dashboard FMS tab and the All-Tasks FMS tab.
export async function getMyFmsPendingRows({ userId, userName, isAdmin }) {
  const sheets = await getFmsSheetsForUser(userId, isAdmin);
  if (!sheets.length) return [];

  const items = [];
  for (const sheet of sheets) {
    let steps;
    try {
      steps = await getStepsForTaskView(sheet.id, userId, isAdmin);
    } catch { continue; }
    const relevantSteps = isAdmin ? steps : steps.filter((s) => s.isMyStep);
    if (!relevantSteps.length) continue;

    let allRows;
    try { allRows = await fetchRange(sheet.sheet_id, `${sheet.sheet_name}!A:${lastColForSteps(relevantSteps)}`); } catch { continue; }

    for (const step of relevantSteps) {
      const result = computePendingRows(allRows, sheet, step, userName, isAdmin);
      const fmsName = sheet.fms_name || sheet.sheet_name;
      result.rows.forEach((row) => {
        const planDate = parsePlanDate(row.planValue);
        items.push({
          id: `${sheet.id}-${step.id}-${row.sheetRowNumber}`,
          fmsId: sheet.id, stepId: step.id, rowNumber: row.sheetRowNumber,
          type: 'FMS',
          fmsName, stepName: step.step_name,
          doer: row.rowDoerName || (step.doers.map((d) => d.name).join(', ')) || '—',
          planValue: row.planValue,
          details: Object.entries(row.data).map(([header, value]) => ({ header, value })),
          description: `${fmsName} · ${step.step_name}`,
          date: planDate, dueDate: planDate, client: '',
          overdue: !!(planDate && planDate < new Date().toISOString().slice(0, 10)),
          isLate: !!(planDate && planDate < new Date().toISOString().slice(0, 10)),
          status: 'pending',
        });
      });
    }
  }
  return items;
}

// Per-employee pending/completed/delayed totals across ALL FMS sheets, with
// plan-date in [start, end] — matches the per-employee shape the rest of
// /api/mis already returns (Delegation MIS / Checklist MIS).
export async function getFmsMisRows(start, end) {
  const sheets = await listFmsSheets();
  if (!sheets.length) return [];
  const today = new Date().toISOString().slice(0, 10);
  const empMap = {};

  for (const sheet of sheets) {
    let steps;
    try { steps = await getFullSteps(sheet.id); } catch { continue; }
    if (!steps.length) continue;
    const allCols = steps.flatMap((s) => [colToIdx(s.plan_col), colToIdx(s.actual_col)]).filter((x) => x >= 0);
    if (!allCols.length) continue;
    const lastCol = idxToCol(Math.max(...allCols));
    let allRows;
    try { allRows = await fetchRange(sheet.sheet_id, `${sheet.sheet_name}!A:${lastCol}`); } catch { continue; }
    const headerRowIdx = (sheet.header_row || 1) - 1;
    const dataRows = allRows.slice(headerRowIdx + 1);

    for (const step of steps) {
      const planIdx = colToIdx(step.plan_col), actualIdx = colToIdx(step.actual_col);
      if (planIdx < 0) continue;
      const names = step.doers.map((d) => d.name).filter(Boolean);
      if (!names.length) continue;
      dataRows.forEach((row) => {
        const planVal = (row[planIdx] || '').toString().trim();
        if (!planVal) return;
        const planDate = parsePlanDate(planVal);
        if (start && end && (!planDate || planDate < start || planDate > end)) return;
        const actualVal = actualIdx >= 0 ? (row[actualIdx] || '').toString().trim() : '';
        names.forEach((name) => {
          if (!empMap[name]) empMap[name] = { name, total: 0, completed: 0, pending: 0, revised: 0, delayed: 0 };
          const e = empMap[name];
          e.total++;
          if (actualVal) e.completed++;
          else {
            e.pending++;
            if (planDate && planDate < today) e.delayed++;
          }
        });
      });
    }
  }
  return Object.values(empMap);
}

// All pending rows across every FMS sheet, bucketed by each step's
// configured doer names — one pass per sheet, used by the daily WhatsApp
// reminder so N users don't each re-fetch the same sheets.
export async function getFmsPendingGroupedByDoer() {
  const sheets = await listFmsSheets();
  if (!sheets.length) return {};
  const byDoer = {};

  for (const sheet of sheets) {
    let steps;
    try { steps = await getFullSteps(sheet.id); } catch { continue; }
    if (!steps.length) continue;
    const allCols = steps.flatMap((s) => [colToIdx(s.plan_col), colToIdx(s.actual_col)]).filter((x) => x >= 0);
    if (!allCols.length) continue;
    const lastCol = idxToCol(Math.max(...allCols));
    let allRows;
    try { allRows = await fetchRange(sheet.sheet_id, `${sheet.sheet_name}!A:${lastCol}`); } catch { continue; }
    const headerRowIdx = (sheet.header_row || 1) - 1;
    const dataRows = allRows.slice(headerRowIdx + 1);
    const fmsName = sheet.fms_name || sheet.sheet_name;

    for (const step of steps) {
      const planIdx = colToIdx(step.plan_col), actualIdx = colToIdx(step.actual_col);
      if (planIdx < 0) continue;
      const names = step.doers.map((d) => d.name).filter(Boolean);
      if (!names.length) continue;
      dataRows.forEach((row) => {
        const planVal   = (row[planIdx] || '').toString().trim();
        const actualVal = actualIdx >= 0 ? (row[actualIdx] || '').toString().trim() : '';
        if (!blankClean(planVal) || blankClean(actualVal)) return;
        names.forEach((name) => {
          (byDoer[name] = byDoer[name] || []).push({
            fmsName, stepName: step.step_name, planValue: planVal, dueDate: parsePlanDate(planVal),
          });
        });
      });
    }
  }
  return byDoer;
}

// Row-level detail for one employee — MIS drill-down (both pending and done).
export async function getFmsMisDetailRows(employeeName, start, end) {
  const sheets = await listFmsSheets();
  if (!sheets.length) return [];
  const rows = [];

  for (const sheet of sheets) {
    let steps;
    try { steps = await getFullSteps(sheet.id); } catch { continue; }
    const mySteps = steps.filter((s) => s.doers.some((d) => d.name === employeeName));
    if (!mySteps.length) continue;
    const allCols = mySteps.flatMap((s) => [colToIdx(s.plan_col), colToIdx(s.actual_col)]).filter((x) => x >= 0);
    if (!allCols.length) continue;
    const lastCol = idxToCol(Math.max(...allCols));
    let allRows;
    try { allRows = await fetchRange(sheet.sheet_id, `${sheet.sheet_name}!A:${lastCol}`); } catch { continue; }
    const headerRowIdx = (sheet.header_row || 1) - 1;
    const dataRows = allRows.slice(headerRowIdx + 1);

    for (const step of mySteps) {
      const planIdx = colToIdx(step.plan_col), actualIdx = colToIdx(step.actual_col);
      if (planIdx < 0) continue;
      dataRows.forEach((row) => {
        const planVal = (row[planIdx] || '').toString().trim();
        if (!planVal) return;
        const planDate = parsePlanDate(planVal);
        if (start && end && (!planDate || planDate < start || planDate > end)) return;
        const actualVal = actualIdx >= 0 ? (row[actualIdx] || '').toString().trim() : '';
        rows.push({
          fmsName: sheet.fms_name || sheet.sheet_name, stepName: step.step_name,
          planValue: planVal, dueDate: planDate || '',
          status: actualVal ? 'done' : 'pending',
        });
      });
    }
  }
  return rows;
}

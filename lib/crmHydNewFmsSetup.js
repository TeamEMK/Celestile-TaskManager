/**
 * One-time (25-11-2026): sets up the "CRM Hyd FMS NEW" sheet as an FMS —
 * the Hyderabad CRM order flow redone as 39 steps (Create WhatsApp group →
 * Photoshoot schedule). Order details come in through the app's "+ New
 * Entry" form into A–S of the FMS tab; every step is the order's CRM's
 * (column Q, picked from the CRM team on the form). Step names come from
 * row 2 of the sheet; nothing is created unless rows 2 and 6 are laid out
 * the way this expects. Runs at server start (lib/scheduler.js) and from
 * /api/one-time-jobs; an FMS already pointing at this sheet means done.
 */
import { pool, ensureSchema } from '@/lib/db';
import { createFmsSheet, updateFmsSheet, deleteFmsSheet, saveIntakeFields, saveIntakeSheetConfig, extractSpreadsheetId, fetchRange } from '@/lib/fmsSheet';
import { getSheetsClient } from '@/lib/googleCreds';

const FLAG = 'crm_hyd_fms_new_v1';
export const SHEET_ID = '12Xw2M66G6G0InsXXkwjH8ixRqimIyGMVqSPlR4Gb9y8';
export const TAB = 'FMS';
const HEADER_ROW = 6;
const FMS_NAME = 'CRM Hyd FMS NEW';

// [plan, actual, fields] in step order (row 2 gives the names).
const STEPS = [
  ['T', 'U'], ['X', 'Y'],
  ['AB', 'AC', [['Image Upload', 'AF', 'upload', 1]]],
  ['AG', 'AH'],
  ['AK', 'AL', [['Upload Revised quotation PDF', 'AN', 'upload', 0]]],
  ['AP', 'AQ', [['Image Upload', 'AT', 'upload', 1]]],
  ['AU', 'AV'],
  ['AY', 'AZ', [['Upload Layout PDF', 'BA', 'upload', 1]]],
  ['BC', 'BD'], ['BG', 'BH'], ['BK', 'BL'], ['BO', 'BP'], ['BS', 'BT'], ['BW', 'BX'],
  ['CA', 'CB'], ['CE', 'CF'], ['CI', 'CJ'], ['CM', 'CN'],
  ['CQ', 'CR', [['Upload Revise Quotation PDF', 'CU', 'upload', 0]]],
  ['CV', 'CW', [['Image Upload', 'CZ', 'upload', 1]]],
  ['DA', 'DB'], ['DE', 'DF'], ['DI', 'DJ'], ['DM', 'DN'],
  ['DQ', 'DR', [['UPLOAD FINAL PDF', 'DT', 'upload', 1]]],
  ['DV', 'DW'], ['DZ', 'EA'], ['ED', 'EE'], ['EH', 'EI'], ['EL', 'EM'], ['EP', 'EQ'],
  ['ET', 'EU', [['Image Upload', 'EX', 'upload', 1]]],
  ['EY', 'EZ'], ['FC', 'FD'], ['FG', 'FH'], ['FK', 'FL'], ['FO', 'FP'], ['FS', 'FT'],
  ['FW', 'FX', [['Image Upload', 'GA', 'upload', 1]]],
];

// The "+ New Entry" form, A–S of the FMS tab.
const INTAKE = [
  ['TIMESTAMP', 'A', 'text', 0, { auto_fill: 'timestamp' }],
  ['ORDER NUMBER', 'B', 'order', 1],
  ['CLIENT NAME', 'C', 'text', 1],
  ['PHONE NO', 'D', 'text', 1],
  ['ARCHITECT NAME', 'E', 'text', 0],
  ['ARC. PHONE NO', 'F', 'text', 0],
  ['NO. OF AREAS', 'G', 'number', 1],
  ['AREA NAME', 'H', 'text', 1],
  ['ORDER VALUE', 'I', 'number', 1],
  ['ADVANCE RECEIVED', 'J', 'number', 0],
  ['DATE OF ADVANCE RECEIVED', 'K', 'date', 0],
  ['PRODUCT', 'L', 'text', 1],
  ['TOTAL SFT', 'M', 'number', 1],
  ['TECHNOLOGY', 'N', 'text', 1],
  ['LEAD TIME', 'O', 'text', 0],
  ['DRAWING TIMELINE', 'P', 'text', 0],
  ['CRM', 'Q', 'dropdown', 1, { dropdown_options: '@dept:crm|Hyderabad' }],
  ['EXECUTIVE', 'R', 'text', 1],
  ['QUOTATION PDF', 'S', 'upload', 1],
];

const colIdx = (letter) => [...letter].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const isCrm = (u) => /\bcrm\b|client\s*relationship/i.test(String(u.department || ''));
const isActive = (u) => String(u.active ?? '1') !== '0' && String(u.active) !== 'false';

// The sheet checked against the layout above, and the steps / New Entry
// form built from it. { skipped } when the sheet doesn't match.
async function newSheetConfig() {
  const rows = await fetchRange(SHEET_ID, `${TAB}!A1:GA${HEADER_ROW}`);
  const titles = rows[1] || [];
  const heads = rows[HEADER_ROW - 1] || [];
  const h = (c) => norm(heads[colIdx(c)]);
  for (const [plan, actual, fields = []] of STEPS) {
    if (h(plan) !== 'planned' || h(actual) !== 'actual') return { skipped: `sheet columns moved (${plan}/${actual})` };
    if (!String(titles[colIdx(plan)] || '').trim()) return { skipped: `no step name above ${plan}` };
    for (const [label, col] of fields) {
      if (h(col) !== norm(label)) return { skipped: `column ${col} holds "${heads[colIdx(col)] ?? ''}", not "${label}"` };
    }
  }
  for (const [label, col] of INTAKE) {
    if (h(col) !== norm(label)) return { skipped: `column ${col} holds "${heads[colIdx(col)] ?? ''}", not "${label}"` };
  }

  // Doers: Hyderabad's CRM team (all CRMs if none is marked Hyderabad).
  // Each one sees only the orders whose CRM column names them.
  const [users] = await pool.query('SELECT id, name, department, branch, active FROM users');
  const crm = users.filter((u) => isActive(u) && isCrm(u));
  const hyd = crm.filter((u) => /hyd/i.test(String(u.branch || '')));
  const doers = (hyd.length ? hyd : crm).map((u) => String(u.id));

  const steps = STEPS.map(([plan, actual, fields = []]) => ({
    stepName: String(titles[colIdx(plan)]).replace(/\s+/g, ' ').trim(),
    planCol: plan, actualCol: actual,
    extraInput: fields.length ? 'yes' : 'no',
    extraRows: fields.map(([label, col, type, required]) => ({ label, col_letter: col, field_type: type, required })),
    doers, doerNameCol: 'Q',
  }));
  const intake = INTAKE.map(([label, col, type, required, more = {}]) => ({
    field_label: label, col_letter: col, field_type: type, required, ...more,
  }));
  return { steps, intake, doers: doers.length };
}

export async function setupCrmHydNewFms() {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  if (flag.length) return { skipped: 'already done' };

  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const existing = sheets.find((s) => extractSpreadsheetId(s.sheet_id) === SHEET_ID);
  if (existing) return { skipped: `already set up as ${existing.id}` };

  const cfg = await newSheetConfig();
  if (cfg.skipped) return cfg;
  const id = await createFmsSheet({ fmsName: FMS_NAME, sheetName: TAB, sheetId: SHEET_ID, headerRow: HEADER_ROW, steps: cfg.steps });
  await saveIntakeFields(id, cfg.intake);

  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG, id, id]);
  return { fmsId: id, steps: cfg.steps.length, doers: cfg.doers };
}

/**
 * One-time (27-11-2026): the CRM Hyd FMS the team actually opens was still
 * set up on a sheet the app's Google account can't edit, so its New Entry
 * form failed with "Access denied. Sheet write permission needed." — "meri
 * ye sheet hai (12Xw2M66…), isko connect kro and FMS mai set bhi kro".
 *
 * Every "CRM Hyd" FMS still on the old sheet (1d2ePij2…, now titled "CRM
 * Hyd FMS NEW---old FMS") or on a sheet the app can't write is checked; the one with a New Entry form (else the first) is moved onto
 * this sheet — same FMS id and name, so its link and the people using it
 * stay — with the 39 steps and the A–S form above. The separate "CRM Hyd
 * FMS NEW" that setupCrmHydNewFms() made is then removed, so the one sheet
 * isn't tracked twice. Nothing to move → the separate one is made (if it
 * isn't there yet) and that's the FMS.
 */
const FLAG_CONNECT = 'crm_hyd_connect_v1';
const OLD_SHEET_ID = '1d2ePij2yI5EyXYoMp634QJ33LT50x9yYF1gFPuVNbm0';

// Can the app's account edit this spreadsheet? Read its title, then write
// the same title back — a write that changes nothing. (An empty batchUpdate
// is refused as malformed before access is even checked.) 403/404 = no.
async function canEdit(sheetIdOrUrl) {
  const id = extractSpreadsheetId(sheetIdOrUrl);
  if (!id) return true;
  const api = getSheetsClient();
  try {
    const m = await api.spreadsheets.get({ spreadsheetId: id, fields: 'properties.title' });
    await api.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [
      { updateSpreadsheetProperties: { properties: { title: m.data.properties.title }, fields: 'title' } },
    ] } });
    return true;
  } catch (e) {
    const code = e?.code || e?.response?.status;
    if (code === 403 || code === 404) return false;
    throw e;
  }
}

export async function connectCrmHydFms() {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG_CONNECT]);
  if (flag.length) return { skipped: 'already done' };

  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const crm = sheets.filter((s) => /crm\s*hyd/i.test(String(s.fms_name || '')) && !/design/i.test(String(s.fms_name || '')));
  const [intakeRows] = await pool.query('SELECT fms_id FROM fms_intake_fields');
  const hasForm = new Set(intakeRows.map((r) => String(r.fms_id)));

  // On the old sheet ("CRM Hyd FMS NEW---old FMS"), or on one the app can't edit.
  const onOld = (s) => [s.sheet_id, s.intake_sheet_id].some((x) => extractSpreadsheetId(x) === OLD_SHEET_ID);
  const broken = [];
  for (const s of crm) {
    if (extractSpreadsheetId(s.sheet_id) === SHEET_ID && !String(s.intake_sheet_id || '').trim()) continue;
    const ok = !onOld(s) && (await canEdit(s.sheet_id))
      && (!String(s.intake_sheet_id || '').trim() || await canEdit(s.intake_sheet_id));
    if (!ok) broken.push(s);
  }
  // The one setupCrmHydNewFms() made (its id is the flag's value).
  const [made] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  const separate = sheets.find((s) => String(s.id) === String(made[0]?.value || ''))
    || crm.find((s) => String(s.fms_name).trim() === FMS_NAME && extractSpreadsheetId(s.sheet_id) === SHEET_ID);

  const done = async (result) => {
    await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      [FLAG_CONNECT, JSON.stringify(result).slice(0, 400), JSON.stringify(result).slice(0, 400)]);
    return result;
  };

  if (!broken.length) {
    const made = await setupCrmHydNewFms();
    return done({ nothingBroken: true, checked: crm.map((s) => s.fms_name), separate: made });
  }

  const cfg = await newSheetConfig();
  if (cfg.skipped) return cfg; // not flagged — retried at the next start

  const target = broken.find((s) => hasForm.has(String(s.id))) || broken[0];
  await updateFmsSheet(target.id, {
    fmsName: target.fms_name, sheetName: TAB, sheetId: SHEET_ID, headerRow: HEADER_ROW,
    steps: cfg.steps, processCoordinatorId: target.process_coordinator_id || null,
  });
  await saveIntakeFields(target.id, cfg.intake);
  await saveIntakeSheetConfig(target.id, { sheetId: '', sheetName: '', headerRow: null, formName: target.intake_form_name || '' });

  let removed = null;
  if (separate && separate.id !== target.id) {
    await deleteFmsSheet(separate.id);
    removed = separate.id;
  }
  return done({
    connected: { id: target.id, name: target.fms_name, steps: cfg.steps.length, doers: cfg.doers },
    removedDuplicate: removed,
    stillBroken: broken.filter((s) => s.id !== target.id).map((s) => `${s.fms_name} (${s.id})`),
  });
}

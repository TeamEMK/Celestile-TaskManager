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
import { createFmsSheet, saveIntakeFields, extractSpreadsheetId, fetchRange } from '@/lib/fmsSheet';

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

export async function setupCrmHydNewFms() {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  if (flag.length) return { skipped: 'already done' };

  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const existing = sheets.find((s) => extractSpreadsheetId(s.sheet_id) === SHEET_ID);
  if (existing) return { skipped: `already set up as ${existing.id}` };

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
  const id = await createFmsSheet({ fmsName: FMS_NAME, sheetName: TAB, sheetId: SHEET_ID, headerRow: HEADER_ROW, steps });
  await saveIntakeFields(id, INTAKE.map(([label, col, type, required, more = {}]) => ({
    field_label: label, col_letter: col, field_type: type, required, ...more,
  })));

  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG, id, id]);
  return { fmsId: id, steps: steps.length, doers: doers.length };
}

/**
 * One-time (25-11-2026, Vivek sir): Factory O2D gets an "Accounts Approval"
 * step between Packing and Dispatch — nothing is dispatched until the
 * branch's accountant approves it (H… / HD… orders → Hyderabad's, B… / BD…
 * → Bangalore's; routed in lib/fmsSheet.js getFullSteps).
 *
 * Sheet (Factory_Order_FMS): a new block at BZ–CD, after the last one —
 *   BZ Planned  = Packing actual (BB) + 1 working day
 *   CA Actual   (written by the app)
 *   CB Status   = Done once CA is set
 *   CC Remarks  (the accountant's note, optional)
 *   CD Time Delay
 * and Dispatch's Planned (BI) waits for CA. Rows dispatched before this keep
 * their dates (BJ set → BI as before, no approval asked of them).
 *
 * App: the step goes in just before Dispatch. Inserting columns in the middle
 * of the sheet would have moved every later step's letters, hence the end.
 * Runs at server start (lib/scheduler.js) and from /api/one-time-jobs.
 */
import { pool, ensureSchema } from '@/lib/db';
import { getSheetsClient } from '@/lib/googleCreds';
import { extractSpreadsheetId } from '@/lib/fmsSheet';

const FLAG = 'o2d_accounts_approval_v1';
const SHEET_ID = '1-WAv9-TD7pPDiNEHMVERUM2Rn1zvoM8eBEes7lV6rOE';
const TAB = 'Factory_Order_FMS';
const TITLE = 'Step9A - Accounts Approval';
const STEP_NAME = 'Accounts Approval';
const HEADS = ['Planned', 'Actual', 'Status', 'Remarks', 'Time Delay'];
const FIRST = 'BZ'; // BZ..CD
const COL = { plan: 'BZ', actual: 'CA', status: 'CB', remarks: 'CC', delay: 'CD' };
const NEED_COLS = 82; // through CD

const oldDispatch = (r) => `=IF(BB${r}, WORKDAY.INTL(B${r}, BI$5, "0000001", Holidays!$A:$A) + TIME(HOUR(BB${r}), MINUTE(BB${r}), SECOND(BB${r})), "")`;
const newDispatch = (r) => `=IF(AND(BB${r}<>"",OR(CA${r}<>"",BJ${r}<>"")), WORKDAY.INTL(B${r}, BI$5, "0000001", Holidays!$A:$A) + TIME(HOUR(BB${r}), MINUTE(BB${r}), SECOND(BB${r})), "")`;
const planF = (r) => `=IF(AND(BB${r}<>"",OR(BJ${r}="",CA${r}<>"")), WORKDAY.INTL(BB${r}, BZ$5, "0000001", Holidays!$A:$A) + TIME(HOUR(BB${r}), MINUTE(BB${r}), SECOND(BB${r})), "")`;
const delayF = (r) => `=if(BZ${r},if(CA${r}<>"",if(CA${r}>BZ${r},CA${r}-BZ${r},""),$B$1-BZ${r}),"")`;
const squash = (f) => String(f ?? '').replace(/\s+/g, '');

// Exported for a test run against a copy of the sheet.
export async function setUpSheet(spreadsheetId = SHEET_ID) {
  const api = getSheetsClient();
  const meta = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const props = meta.data.sheets.map((x) => x.properties).find((p) => p.title === TAB);
  if (!props) return { error: `no tab ${TAB}` };
  const { sheetId, gridProperties: { rowCount, columnCount } } = props;
  const last = rowCount;

  if (columnCount >= NEED_COLS) {
    const cur = await api.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!${FIRST}2:CD6` });
    const v = cur.data.values || [];
    const title = String(v[0]?.[0] ?? '').trim();
    const used = v.some((row) => (row || []).some((c) => String(c ?? '').trim()));
    if (used && title !== TITLE) return { error: `${FIRST}–CD already hold "${title || 'something'}"` };
  }

  // Dispatch's Planned must still be the formula this replaces, every row.
  const bi = await api.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!BI7:BI${last}`, valueRenderOption: 'FORMULA' });
  const biRows = bi.data.values || [];
  for (let i = 0; i < biRows.length; i++) {
    const r = i + 7; const f = squash(biRows[i]?.[0]);
    if (f && f !== squash(oldDispatch(r)) && f !== squash(newDispatch(r))) return { error: `Dispatch Planned BI${r} is a different formula` };
  }

  const requests = [];
  if (columnCount < NEED_COLS) {
    requests.push({ appendDimension: { sheetId, dimension: 'COLUMNS', length: NEED_COLS - columnCount } });
  }
  // Look like the Dispatch block (BI–BL): headers and the data cells.
  const range = (c0, c1) => ({ sheetId, startRowIndex: 0, endRowIndex: last, startColumnIndex: c0, endColumnIndex: c1 });
  requests.push({ copyPaste: { source: range(60, 64), destination: range(77, 81), pasteType: 'PASTE_FORMAT' } });
  requests.push({ copyPaste: { source: range(63, 64), destination: range(81, 82), pasteType: 'PASTE_FORMAT' } });
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

  const rows = [];
  for (let r = 7; r <= last; r++) rows.push(r);
  await api.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `${TAB}!${FIRST}2:${FIRST}5`, values: [[TITLE], ['Accountant'], ['App'], [1]] },
        { range: `${TAB}!${FIRST}6:CD6`, values: [HEADS] },
        { range: `${TAB}!${COL.plan}7:${COL.plan}${last}`, values: rows.map((r) => [planF(r)]) },
        { range: `${TAB}!${COL.status}7`, values: [[`=ARRAYFORMULA(IF(${COL.actual}7:${COL.actual}${last}="","","Done"))`]] },
        { range: `${TAB}!${COL.delay}7:${COL.delay}${last}`, values: rows.map((r) => [delayF(r)]) },
        { range: `${TAB}!BI7:BI${last}`, values: rows.map((r) => [newDispatch(r)]) },
      ],
    },
  });
  return { rows: last - 6 };
}

export async function migrateO2dAccountsApproval() {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  if (flag.length) return { skipped: 'already done' };

  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const fms = sheets.find((s) => extractSpreadsheetId(s.sheet_id) === SHEET_ID && String(s.sheet_name).trim() === TAB);
  if (!fms) return { skipped: 'no Factory O2D FMS' };

  const [steps] = await pool.query('SELECT * FROM fms_sheet_steps WHERE fms_id = ?', [fms.id]);
  const dispatch = steps.find((s) => String(s.actual_col).toUpperCase() === 'BJ');
  if (!dispatch) return { skipped: 'no Dispatch step (actual BJ)' };
  if (steps.some((s) => String(s.plan_col).toUpperCase() === COL.plan)) return { skipped: 'step already there' };

  const sheet = await setUpSheet();
  if (sheet.error) return { skipped: sheet.error };

  const at = Number(dispatch.step_order);
  for (const s of steps) {
    if (Number(s.step_order) >= at) {
      await pool.query('UPDATE fms_sheet_steps SET step_order = ? WHERE id = ?', [Number(s.step_order) + 1, s.id]);
    }
  }
  const id = `STP${Date.now()}_acc`;
  await pool.query(
    `INSERT INTO fms_sheet_steps
      (id, fms_id, step_order, step_name, plan_col, actual_col, extra_input, extra_col, show_cols, delay_reason_col, doer_name_col, open_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, fms.id, at, STEP_NAME, COL.plan, COL.actual, 'yes', '', dispatch.show_cols || '[]', '', '', ''],
  );
  await pool.query(
    'INSERT INTO fms_extra_rows (id, step_id, row_label, col_letter, field_type, dropdown_options, required, depends_on, depends_value, alert_on, alert_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [`${id}_ER0`, id, 'Remarks', COL.remarks, 'text', '', 0, '', '', '', ''],
  );

  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG, id, id]);
  return { fmsId: fms.id, stepId: id, before: dispatch.step_name, sheetRows: sheet.rows };
}

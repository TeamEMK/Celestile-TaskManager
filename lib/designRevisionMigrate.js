/**
 * One-time switch of the live Design FMS's CRM steps from "Approved?" to
 * "Revision?" (02-11-2026 meeting, lib/designFlow.js): "Yes" now sends the
 * work back and needs what to change + a photo; "No" is the approval.
 *
 * Edits only the CRM steps' Additional Fields in place — every other step,
 * and anything changed in the FMS editor since, stays as it is — and puts
 * the new headers on the "Design FMS" tab (photo columns after the last
 * column, so no formula moves). Runs at server start (lib/scheduler.js);
 * the app_config flag stops a second run.
 */
import { pool, ensureSchema } from '@/lib/db';
import { extractSpreadsheetId, fetchRange, writeCells } from '@/lib/fmsSheet';
import { getSheetsClient } from '@/lib/googleCreds';
import { DESIGN_SHEET_ID, NEW_TAB, HEADER_ROW, designLayout, crmRevisionRows } from '@/lib/designFlow';

const FLAG = 'design_crm_revision';
const key = (v) => String(v || '').trim().toUpperCase();

export async function migrateDesignRevision() {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  if (flag.length) return { skipped: 'already done' };
  // The flow-v2 switch must have run first — it is what lays out these steps.
  const [v2] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', ['design_flow_v2']);
  if (!v2.length) return { skipped: 'design flow v2 not switched yet' };

  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const fms = sheets.find((s) => extractSpreadsheetId(s.sheet_id) === DESIGN_SHEET_ID && s.sheet_name === NEW_TAB);
  if (!fms) return { skipped: 'no Design FMS on the new tab' };

  const layout = designLayout();
  const [headers = []] = await fetchRange(DESIGN_SHEET_ID, `${NEW_TAB}!${HEADER_ROW}:${HEADER_ROW}`);
  const at = (letter) => String(headers[layout.cols.findIndex((c) => c.letter === letter)] ?? '').trim();
  // Never write over a column somebody has put something else in.
  for (const g of layout.groups) {
    const now = at(g.crm.photo);
    if (now && now !== `${g.n}C Revision Photo`) return { skipped: `column ${g.crm.photo} already holds "${now}"` };
  }
  await ensureColumns(layout.cols.length);
  const headerWrites = layout.groups.flatMap((g) => [g.crm.approved, g.crm.remarks, g.crm.photo]
    .map((letter) => ({ colLetter: letter, rowNumber: HEADER_ROW, value: layout.cols.find((c) => c.letter === letter).header })));
  await writeCells(DESIGN_SHEET_ID, NEW_TAB, headerWrites);

  const [steps] = await pool.query('SELECT * FROM fms_sheet_steps WHERE fms_id = ?', [fms.id]);
  const [allExtra] = await pool.query('SELECT * FROM fms_extra_rows');
  let changed = 0;
  for (const g of layout.groups) {
    const step = steps.find((s) => key(s.plan_col) === key(g.crm.plan) && /crm/i.test(String(s.step_name || '')));
    if (!step) continue;
    const rows = allExtra.filter((r) => String(r.step_id) === String(step.id));
    const byCol = (letter) => rows.find((r) => key(r.col_letter) === key(letter));

    const answer = byCol(g.crm.approved);
    if (answer) {
      await pool.query('UPDATE fms_extra_rows SET row_label = ?, dropdown_options = ?, required = ?, alert_on = ? WHERE id = ?',
        ['Revision?', 'Yes,No', 1, 'never', answer.id]);
    }
    let n = rows.length;
    for (const want of crmRevisionRows(g.crm)) {
      const have = byCol(want.col_letter);
      if (have) {
        await pool.query('UPDATE fms_extra_rows SET row_label = ?, field_type = ?, required = ?, depends_on = ?, depends_value = ? WHERE id = ?',
          [want.label, want.field_type, want.required, want.depends_on, want.depends_value, have.id]);
      } else {
        let id;
        do { id = `${step.id}_ER${n++}`; } while (rows.some((r) => r.id === id));
        await pool.query(
          'INSERT INTO fms_extra_rows (id, step_id, row_label, col_letter, field_type, dropdown_options, required, depends_on, depends_value, alert_on, alert_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, step.id, want.label, want.col_letter, want.field_type, '', want.required, want.depends_on, want.depends_value, '', '']
        );
      }
    }
    changed++;
  }

  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG, new Date().toISOString(), new Date().toISOString()]);
  return { fmsId: fms.id, crmSteps: changed };
}

// A tab's grid is only as wide as it was made; writing past it fails. The
// photo columns are the first ones past the flow-v2 layout, so widen first.
async function ensureColumns(count) {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: DESIGN_SHEET_ID, fields: 'sheets.properties' });
  const tab = meta.data.sheets.find((x) => x.properties.title === NEW_TAB)?.properties;
  const have = tab?.gridProperties?.columnCount || 0;
  if (!tab || have >= count) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: DESIGN_SHEET_ID,
    requestBody: { requests: [{ appendDimension: { sheetId: tab.sheetId, dimension: 'COLUMNS', length: count - have } }] },
  });
}

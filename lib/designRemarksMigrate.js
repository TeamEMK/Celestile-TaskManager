/**
 * One-time (03-11-2026): Jibin's review steps (Step nB) ask for Remarks only
 * when he rejects — "Approved? No" — and then require them (lib/designFlow.js
 * reviewRemarksRow). Updates those rows of the live config in place; a full
 * re-save would rewrite every step for six fields. Runs at server start
 * (lib/scheduler.js); the app_config flag stops a second run.
 */
import { pool, ensureSchema } from '@/lib/db';
import { extractSpreadsheetId } from '@/lib/fmsSheet';
import { DESIGN_SHEET_ID, NEW_TAB, designLayout, reviewRemarksRow } from '@/lib/designFlow';

const FLAG = 'design_review_remarks';
const key = (v) => String(v || '').trim().toUpperCase();

export async function migrateDesignReviewRemarks() {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  if (flag.length) return { skipped: 'already done' };

  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const fms = sheets.find((s) => extractSpreadsheetId(s.sheet_id) === DESIGN_SHEET_ID && s.sheet_name === NEW_TAB);
  if (!fms) return { skipped: 'no Design FMS on the new tab' };

  const [steps] = await pool.query('SELECT * FROM fms_sheet_steps WHERE fms_id = ?', [fms.id]);
  const [allExtra] = await pool.query('SELECT * FROM fms_extra_rows');
  let changed = 0;
  for (const g of designLayout().groups) {
    const step = steps.find((s) => key(s.plan_col) === key(g.review.plan));
    if (!step) continue;
    const want = reviewRemarksRow(g);
    const row = allExtra.find((r) => String(r.step_id) === String(step.id) && key(r.col_letter) === key(want.col_letter));
    if (!row) continue;
    await pool.query('UPDATE fms_extra_rows SET required = ?, depends_on = ?, depends_value = ? WHERE id = ?',
      [want.required, want.depends_on, want.depends_value, row.id]);
    changed++;
  }

  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG, new Date().toISOString(), new Date().toISOString()]);
  return { fmsId: fms.id, reviewSteps: changed };
}

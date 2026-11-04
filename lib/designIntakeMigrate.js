/**
 * One-time (04-11-2026): the Design O2D New Entry form also asks SFT, Stone
 * Type and Thickness (lib/designFlow.js intakeStoneFields), written to the
 * Design FMS tab's DS–DU. Appends the three to the live form after its own
 * fields, leaving those as they are; skipped where a field already uses the
 * column or the label. Runs at server start and from /api/one-time-jobs.
 */
import { pool, ensureSchema } from '@/lib/db';
import { extractSpreadsheetId, fetchRange } from '@/lib/fmsSheet';
import { DESIGN_SHEET_ID, NEW_TAB, HEADER_ROW, designLayout, intakeStoneFields } from '@/lib/designFlow';

// v2: Area Name + Technology joined the three (same day) — a run of the first
// version is picked up, the two added and all five put in form order.
const FLAG = 'design_intake_stone_v2';
const key = (v) => String(v || '').trim().toUpperCase();

export async function migrateDesignIntakeStone() {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  if (flag.length) return { skipped: 'already done' };

  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const fms = sheets.find((s) => extractSpreadsheetId(s.sheet_id) === DESIGN_SHEET_ID && s.sheet_name === NEW_TAB);
  if (!fms) return { skipped: 'no Design FMS on the new tab' };

  // The columns must be there (laid out with the sheet).
  const layout = designLayout();
  const [headers = []] = await fetchRange(DESIGN_SHEET_ID, `${NEW_TAB}!${HEADER_ROW}:${HEADER_ROW}`);
  const want = intakeStoneFields(layout);
  for (const f of want) {
    const h = String(headers[layout.cols.findIndex((c) => c.letter === f.col_letter)] ?? '').trim();
    if (h !== f.field_label) return { skipped: `column ${f.col_letter} holds "${h}", not "${f.field_label}"` };
  }

  const [fields] = await pool.query('SELECT * FROM fms_intake_fields WHERE fms_id = ?', [fms.id]);
  const isOurs = (x) => want.some((f) => key(x.col_letter) === key(f.col_letter));
  // The form's own fields keep their place; ours follow, in `want` order.
  let order = Math.max(-1, ...fields.filter((x) => !isOurs(x)).map((f) => Number(f.sort_order) || 0)) + 1;
  const added = [];
  const ids = new Set(fields.map((x) => x.id));
  for (const f of want) {
    const have = fields.find((x) => key(x.col_letter) === key(f.col_letter));
    if (have) {
      await pool.query('UPDATE fms_intake_fields SET sort_order = ? WHERE id = ?', [order++, have.id]);
      continue;
    }
    if (fields.some((x) => key(x.field_label) === key(f.field_label))) continue; // same label, another column
    let id, n = fields.length + added.length;
    do { id = `${fms.id}_IF${n++}`; } while (ids.has(id));
    ids.add(id);
    await pool.query(
      'INSERT INTO fms_intake_fields (id, fms_id, field_label, col_letter, field_type, dropdown_options, required, sort_order, auto_fill, auto_fill_value, depends_on, depends_value, unique_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, fms.id, f.field_label, f.col_letter, f.field_type, f.dropdown_options || '', 1, order++, '', '', '', '', 0]
    );
    added.push(f.field_label);
  }

  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG, new Date().toISOString(), new Date().toISOString()]);
  return { fmsId: fms.id, added };
}

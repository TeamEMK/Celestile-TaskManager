/**
 * One-time (17-11-2026): Enquiry Management FMS steps back onto their sheet
 * columns. A column ("Assing to", the branch formula in S) and the "Getting
 * Touch" block were added to the sheet after the FMS was set up, so every
 * step read one block early — "Assign Sales Person" took the branch in S as
 * its Planned, Share Quotation and Follow up for advance shared AO/AP, and
 * each step asked the next one's question. The sheet is the reference
 * ("sheet link diya hai vo sahi hai"): steps keep their names, doers and ids;
 * Planned / Actual / Time Delay and the fields are set from it. Nothing is
 * changed unless the sheet's headers are where this expects them. Runs at
 * server start (lib/scheduler.js) and from /api/one-time-jobs.
 */
import { pool, ensureSchema } from '@/lib/db';
import { extractSpreadsheetId, fetchRange } from '@/lib/fmsSheet';

const FLAG = 'enquiry_steps_cols_v1';
const SHEET_ID = '1_jqarJXZUwZ4pQHcr51KUPnKek3vPWd1QI-P8z1ChNM';
const TAB = 'Enquiry Management FMS';
const HEADER_ROW = 6;

// In step order, as rows 2 and 6 of the sheet lay them out.
const STEPS = [
  { name: /assign\s*sales/i, plan: 'T', actual: 'U', delay: 'W', fields: [
    { label: 'Sales Person Name', col: 'V', type: 'text', required: 1 },
  ] },
  { name: /getting\s*touch/i, plan: 'X', actual: 'Y', delay: 'AA', fields: [
    { label: 'Visit Date/Meeting Date', col: 'Z', type: 'date', required: 1 },
  ] },
  { name: /update\s*meeting/i, plan: 'AB', actual: 'AC', delay: 'AF', fields: [
    { label: 'Status', col: 'AD', type: 'dropdown', options: 'Completed,Reschedule', required: 1 },
    { label: 'Next Follow up Date', col: 'AE', type: 'date', required: 1, dependsOn: 'AD', dependsValue: 'Reschedule' },
  ] },
  { name: /follow\s*up\s*for\s*meeting/i, plan: 'AG', actual: 'AH', delay: 'AJ', fields: [
    { label: 'Visit Date/Meeting Date', col: 'AI', type: 'date', required: 1 },
  ] },
  { name: /share\s*quotation/i, plan: 'AK', actual: 'AL', delay: 'AN', fields: [
    { label: 'Quotation link', col: 'AM', type: 'link', required: 1 },
  ] },
  { name: /follow\s*up\s*for\s*advance/i, plan: 'AP', actual: 'AQ', delay: 'AR', fields: [] },
];

const colIdx = (letter) => [...letter].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export async function migrateEnquirySteps() {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  if (flag.length) return { skipped: 'already done' };

  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const fms = sheets.find((s) => extractSpreadsheetId(s.sheet_id) === SHEET_ID && String(s.sheet_name).trim() === TAB);
  if (!fms) return { skipped: 'no Enquiry FMS' };

  // The sheet must still be laid out this way.
  const [headers = []] = await fetchRange(SHEET_ID, `${TAB}!${HEADER_ROW}:${HEADER_ROW}`);
  const h = (c) => norm(headers[colIdx(c)]);
  for (const s of STEPS) {
    if (h(s.plan) !== 'planned' || h(s.actual) !== 'actual' || h(s.delay) !== 'time delay') {
      return { skipped: `sheet columns moved again (${s.plan}/${s.actual}/${s.delay})` };
    }
    for (const f of s.fields) {
      if (h(f.col) !== norm(f.label)) return { skipped: `column ${f.col} holds "${headers[colIdx(f.col)] ?? ''}", not "${f.label}"` };
    }
  }

  const [steps] = await pool.query('SELECT * FROM fms_sheet_steps WHERE fms_id = ?', [fms.id]);
  const ordered = steps.sort((a, b) => Number(a.step_order) - Number(b.step_order));
  const used = new Set();
  const plan = STEPS.map((want) => {
    const st = ordered.find((s) => !used.has(s.id) && want.name.test(String(s.step_name || '')));
    if (st) used.add(st.id);
    return { want, st };
  });
  const missing = plan.filter((p) => !p.st).map((p) => String(p.want.name));
  if (missing.length) return { skipped: `steps not found: ${missing.join(', ')}` };

  const [allExtra] = await pool.query('SELECT * FROM fms_extra_rows');
  const done = [];
  for (const { want, st } of plan) {
    await pool.query(
      'UPDATE fms_sheet_steps SET plan_col = ?, actual_col = ?, delay_reason_col = ?, extra_input = ? WHERE id = ?',
      [want.plan, want.actual, want.delay, want.fields.length ? 'yes' : 'no', st.id],
    );
    for (const r of allExtra.filter((x) => String(x.step_id) === String(st.id))) {
      await pool.query('DELETE FROM fms_extra_rows WHERE id = ?', [r.id]);
    }
    for (const [i, f] of want.fields.entries()) {
      await pool.query(
        'INSERT INTO fms_extra_rows (id, step_id, row_label, col_letter, field_type, dropdown_options, required, depends_on, depends_value, alert_on, alert_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [`${st.id}_E${i}_v2`, st.id, f.label, f.col, f.type, f.options || '', f.required, f.dependsOn || '', f.dependsValue || '', 'never', ''],
      );
    }
    done.push(`${String(st.step_name).trim()}: ${want.plan}/${want.actual}`);
  }

  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG, new Date().toISOString(), new Date().toISOString()]);
  return { fmsId: fms.id, steps: done };
}

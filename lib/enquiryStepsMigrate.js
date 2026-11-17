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
export const SHEET_ID = '1_jqarJXZUwZ4pQHcr51KUPnKek3vPWd1QI-P8z1ChNM';
export const TAB = 'Enquiry Management FMS';
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

/**
 * One-time (17-11-2026, after the above): "Sales Person Name" becomes a
 * dropdown of the sales team (@dept:sales, lib/fmsSheet.js), and no Enquiry
 * step asks for a delay reason — the Time Delay columns the fix above set
 * were never asked for.
 */
const FLAG2 = 'enquiry_sales_dropdown_v1';
export async function migrateEnquirySalesDropdown() {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG2]);
  if (flag.length) return { skipped: 'already done' };
  const [f1] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  if (!f1.length) return { skipped: 'waiting for the column fix' };

  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const fms = sheets.find((s) => extractSpreadsheetId(s.sheet_id) === SHEET_ID && String(s.sheet_name).trim() === TAB);
  if (!fms) return { skipped: 'no Enquiry FMS' };

  const [steps] = await pool.query('SELECT * FROM fms_sheet_steps WHERE fms_id = ?', [fms.id]);
  let delays = 0;
  for (const s of steps) {
    if (!String(s.delay_reason_col || '').trim()) continue;
    await pool.query('UPDATE fms_sheet_steps SET delay_reason_col = ? WHERE id = ?', ['', s.id]);
    delays++;
  }
  const ids = new Set(steps.map((s) => String(s.id)));
  const [extra] = await pool.query('SELECT * FROM fms_extra_rows');
  const sp = extra.find((r) => ids.has(String(r.step_id)) && String(r.col_letter).toUpperCase() === 'V');
  if (sp) await pool.query('UPDATE fms_extra_rows SET field_type = ?, dropdown_options = ? WHERE id = ?', ['dropdown', '@dept:sales', sp.id]);

  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG2, new Date().toISOString(), new Date().toISOString()]);
  return { fmsId: fms.id, delayReasonRemoved: delays, salesDropdown: !!sp };
}

/**
 * One-time (17-11-2026, third pass): the sheet grew to seven steps — "Follow
 * Up till" between Getting Touch and Update Meeting Status, a Status on
 * Getting Touch, every block after it moved right. Laid out from the sheet
 * again, with the flow asked for:
 *  - Getting Touch: meeting fixed? Yes → its date; No → Follow Up till.
 *  - Follow Up till / Follow up for advance: "No" brings the task back the
 *    next working day (or the date given), every day, until "Yes".
 *  - Follow Up for Meeting: comes back every day until a meeting date is in.
 *  - CRM gives the lead (step 1); every later step is the sales person's,
 *    shown to the one named in Sales Person Name only.
 * No delay reasons. Doers are set here (sales team / CRM, by department);
 * step names, ids and step alerts are kept where the step already existed.
 */
const FLAG3 = 'enquiry_steps_v3';
const FU = '@followup';
const yesNo = (label, col, header, extra = {}) => ({ label, col, header, type: 'dropdown', options: 'Yes,No', required: 1, alertOn: 'never', ...extra });
const STEPS_V3 = [
  { name: 'Assign Sales Person', match: /assign\s*sales/i, plan: 'T', actual: 'U', who: 'crm', fields: [
    { label: 'Sales Person Name', col: 'V', type: 'dropdown', options: '@dept:sales', required: 1 },
  ] },
  { name: 'Getting Touch With the client and schedule the meeting', match: /getting\s*touch/i, plan: 'X', actual: 'Y', who: 'sales', fields: [
    yesNo('Meeting fixed?', 'Z', 'Status'),
    { label: 'Visit Date/Meeting Date', col: 'AA', type: 'date', required: 1, dependsOn: 'Z', dependsValue: 'Yes' },
  ] },
  { name: 'Follow Up till', match: /follow\s*up\s*till/i, plan: 'AC', actual: 'AD', who: 'sales', fields: [
    yesNo('Meeting fixed?', 'AE', 'Status', { alertOn: 'No', alertTo: FU }),
    { label: 'Visit Date/Meeting Date', col: 'AA', type: 'date', required: 1, dependsOn: 'AE', dependsValue: 'Yes' },
    { label: 'Next follow up date', col: 'AF', type: 'date', required: 0, dependsOn: 'AE', dependsValue: 'No' },
  ] },
  { name: 'Update Meeting Status', match: /update\s*meeting/i, plan: 'AH', actual: 'AI', who: 'sales', fields: [
    { label: 'Status', col: 'AJ', type: 'dropdown', options: 'Completed,Reschedule', required: 1, alertOn: 'never' },
    { label: 'Next Follow up Date', col: 'AK', type: 'date', required: 0, dependsOn: 'AJ', dependsValue: 'Reschedule' },
  ] },
  { name: 'Follow Up for Meeting', match: /follow\s*up\s*for\s*meeting/i, plan: 'AM', actual: 'AN', who: 'sales', fields: [
    { label: 'Visit Date/Meeting Date', col: 'AO', type: 'date', required: 0, alertOn: '(blank)', alertTo: FU },
  ] },
  { name: 'Share Quotation with the client', match: /share\s*quotation/i, plan: 'AQ', actual: 'AR', who: 'sales', fields: [
    { label: 'Quotation link', col: 'AS', type: 'link', required: 1 },
  ] },
  { name: 'Follow up for advance', match: /follow\s*up\s*for\s*advance/i, plan: 'AV', actual: 'AW', who: 'sales', fields: [
    yesNo('Advance received?', 'AY', 'Status', { alertOn: 'No', alertTo: FU }),
    { label: 'Next follow up Date', col: 'AZ', type: 'date', required: 0, dependsOn: 'AY', dependsValue: 'No' },
  ] },
];

// sheetId / tab: the live Enquiry sheet; a copy for a test run.
export async function migrateEnquiryStepsV3({ sheetId = SHEET_ID, tab = TAB } = {}) {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG3]);
  if (flag.length) return { skipped: 'already done' };

  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const fms = sheets.find((s) => extractSpreadsheetId(s.sheet_id) === sheetId && String(s.sheet_name).trim() === tab);
  if (!fms) return { skipped: 'no Enquiry FMS' };

  const [headers = []] = await fetchRange(sheetId, `${tab}!${HEADER_ROW}:${HEADER_ROW}`);
  const h = (c) => norm(headers[colIdx(c)]);
  for (const s of STEPS_V3) {
    if (h(s.plan) !== 'planned' || h(s.actual) !== 'actual') return { skipped: `sheet columns moved (${s.name}: ${s.plan}/${s.actual})` };
    for (const f of s.fields) {
      if (h(f.col) !== norm(f.header || f.label)) return { skipped: `column ${f.col} holds "${headers[colIdx(f.col)] ?? ''}", not "${f.header || f.label}"` };
    }
  }

  const [users] = await pool.query('SELECT id, name, department, active FROM users');
  const live = users.filter((u) => String(u.active ?? '1') !== '0');
  const team = {
    sales: live.filter((u) => /sales/i.test(String(u.department || ''))).map((u) => String(u.id)),
    crm: live.filter((u) => /\bcrm\b|client\s*relationship/i.test(String(u.department || ''))).map((u) => String(u.id)),
  };

  const [steps] = await pool.query('SELECT * FROM fms_sheet_steps WHERE fms_id = ?', [fms.id]);
  const [allExtra] = await pool.query('SELECT * FROM fms_extra_rows');
  const [allDoers] = await pool.query('SELECT * FROM fms_step_doers');
  const used = new Set();
  const done = [];
  for (const [i, want] of STEPS_V3.entries()) {
    let st = steps.find((s) => !used.has(s.id) && want.match.test(String(s.step_name || '')));
    const doerCol = want.who === 'sales' ? 'V' : '';
    if (st) {
      used.add(st.id);
      await pool.query(
        'UPDATE fms_sheet_steps SET step_order = ?, plan_col = ?, actual_col = ?, delay_reason_col = ?, doer_name_col = ?, extra_input = ? WHERE id = ?',
        [i + 1, want.plan, want.actual, '', doerCol, 'yes', st.id],
      );
      for (const r of allExtra.filter((x) => String(x.step_id) === String(st.id))) {
        await pool.query('DELETE FROM fms_extra_rows WHERE id = ?', [r.id]);
      }
    } else {
      st = { id: `${fms.id}_V3S${i}` };
      await pool.query(
        `INSERT INTO fms_sheet_steps
          (id, fms_id, step_order, step_name, plan_col, actual_col, extra_input, extra_col, show_cols, delay_reason_col, doer_name_col, open_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        // Shows the same lead columns as Getting Touch.
        [st.id, fms.id, i + 1, want.name, want.plan, want.actual, 'yes', '',
          steps.find((s) => /getting\s*touch/i.test(String(s.step_name || '')))?.show_cols || '[0,2,3,5,6,7]', '', doerCol, ''],
      );
    }
    for (const [j, f] of want.fields.entries()) {
      await pool.query(
        'INSERT INTO fms_extra_rows (id, step_id, row_label, col_letter, field_type, dropdown_options, required, depends_on, depends_value, alert_on, alert_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [`${st.id}_E${j}_v3`, st.id, f.label, f.col, f.type, f.options || '', f.required, f.dependsOn || '', f.dependsValue || '', f.alertOn || '', f.alertTo || ''],
      );
    }
    const have = new Set(allDoers.filter((d) => String(d.step_id) === String(st.id)).map((d) => String(d.user_id)));
    for (const uid of team[want.who]) {
      if (!have.has(uid)) await pool.query('INSERT INTO fms_step_doers (step_id, user_id) VALUES (?, ?)', [st.id, uid]);
    }
    done.push(`${i + 1}. ${want.name}: ${want.plan}/${want.actual}`);
  }
  // Any step the sheet no longer has stays, but after the seven.
  const extraSteps = steps.filter((s) => !used.has(s.id));
  for (const [k, s] of extraSteps.entries()) {
    await pool.query('UPDATE fms_sheet_steps SET step_order = ? WHERE id = ?', [STEPS_V3.length + 1 + k, s.id]);
  }

  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG3, new Date().toISOString(), new Date().toISOString()]);
  return { fmsId: fms.id, steps: done, leftOver: extraSteps.map((s) => String(s.step_name).trim()), doers: { sales: team.sales.length, crm: team.crm.length } };
}

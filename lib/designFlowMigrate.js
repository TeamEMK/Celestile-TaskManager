/**
 * One-time switch of the Design O2D FMS onto the new flow (lib/designFlow.js):
 * the "Design FMS" tab, laid out ahead of time, and the 19-step config that
 * reads it. Done from code because the production DB can't be reached from a
 * dev machine (same as the seeded Live Tracking trackers). Runs once at
 * server start (lib/scheduler.js); the app_config flag stops a second run,
 * so later edits in the FMS editor stay.
 *
 * Entries that reached the old "FMS" tab after the new tab was laid out are
 * copied across first (timestamp, order no., design folder) — every entry
 * starts the new flow at Step 1, the 2D/3D decision.
 */
import { pool, ensureSchema } from '@/lib/db';
import {
  extractSpreadsheetId, fetchRange, writeCells, getFullSteps, updateFmsSheet, saveIntakeSheetConfig,
} from '@/lib/fmsSheet';
import { DESIGN_SHEET_ID, OLD_TAB, NEW_TAB, HEADER_ROW, designLayout, designSteps } from '@/lib/designFlow';

const FLAG = 'design_flow_v2';
const POOLS = 'design_flow_v2_pools';

const firstWord = (n) => String(n || '').trim().split(/\s+/)[0].toLowerCase();

export async function migrateDesignFlow() {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  if (flag.length) return { skipped: 'already done' };

  // NEW_TAB too: a run cut short (Sheets write quota) has already moved the
  // tab but not finished the steps — the flag is only set at the very end,
  // so the next start picks it up again from here.
  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const fms = sheets.find((s) => extractSpreadsheetId(s.sheet_id) === DESIGN_SHEET_ID && [OLD_TAB, NEW_TAB].includes(s.sheet_name));
  if (!fms) return { skipped: 'no Design FMS found' };

  const layout = designLayout();
  const [headers = []] = await fetchRange(DESIGN_SHEET_ID, `${NEW_TAB}!${HEADER_ROW}:${HEADER_ROW}`);
  const missing = layout.cols.filter((c, i) => String(headers[i] ?? '').trim() !== c.header);
  if (missing.length) return { skipped: `"${NEW_TAB}" tab not laid out (${missing[0].letter}: ${missing[0].header})` };

  // Top up entries the old tab got since the new one was laid out.
  const first = HEADER_ROW + 1;
  const oldRows = (await fetchRange(DESIGN_SHEET_ID, `${OLD_TAB}!A${first}:C`)).filter((r) => String(r[1] ?? '').trim());
  const newRows = await fetchRange(DESIGN_SHEET_ID, `${NEW_TAB}!A${first}:C`);
  const key = (r) => `${String(r[0] ?? '').trim()}|${String(r[1] ?? '').trim()}`;
  const have = new Set(newRows.filter((r) => String(r[1] ?? '').trim()).map(key));
  let next = first + newRows.reduce((last, r, i) => (String(r[1] ?? '').trim() ? i + 1 : last), 0);
  const writes = [];
  for (const r of oldRows) {
    if (have.has(key(r))) continue;
    ['A', 'B', 'C'].forEach((c, i) => writes.push({ colLetter: c, rowNumber: next, value: r[i] ?? '' }));
    next++;
  }
  if (writes.length) await writeCells(DESIGN_SHEET_ID, NEW_TAB, writes);

  const [users] = await pool.query('SELECT id, name FROM users');
  // CRM steps need no list: every CRM-department user joins them, each seeing
  // their own branch (getFullSteps).
  const idsNamed = (names) => users.filter((u) => names.includes(firstWord(u.name))).map((u) => String(u.id));
  // The old steps' doers, saved before anything is rewritten: updateFmsSheet
  // deletes the old steps first, so a resumed run must not read them again.
  const [savedPools] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [POOLS]);
  let pools = savedPools.length ? JSON.parse(savedPools[0].value || '{}') : null;
  if (!pools) {
    pools = Object.fromEntries((await getFullSteps(fms.id))
      .map((s) => [s.step_name, (s.doers || []).map((d) => String(d.user_id))]));
    const v = JSON.stringify(pools);
    await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?', [POOLS, v, v]);
  }
  const oldPool = (re) => Object.entries(pools).filter(([name]) => re.test(String(name || '').trim())).flatMap(([, ids]) => ids);

  await updateFmsSheet(fms.id, {
    fmsName: fms.fms_name, sheetName: NEW_TAB, sheetId: fms.sheet_id, headerRow: HEADER_ROW,
    processCoordinatorId: fms.process_coordinator_id,
    steps: designSteps({ jibin: idsNamed(['jibin']), crm: [], oldPool }, layout),
  });
  // The New Entry form writes where the steps read.
  if (fms.intake_sheet_name === OLD_TAB && (!fms.intake_sheet_id || extractSpreadsheetId(fms.intake_sheet_id) === DESIGN_SHEET_ID)) {
    await saveIntakeSheetConfig(fms.id, {
      sheetId: fms.intake_sheet_id, sheetName: NEW_TAB, headerRow: HEADER_ROW, formName: fms.intake_form_name,
    });
  }
  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG, new Date().toISOString(), new Date().toISOString()]);
  return { fmsId: fms.id, copiedRows: writes.length / 3 };
}

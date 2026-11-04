/**
 * One-time (04-11-2026): Design FMS "Step 4A - Jointing Detail" opens the
 * inventory's Blocking for Jointing page, and submitting the jointing there
 * marks the step done (completeLinkedStepRows, as the Factory's "Sort Raw
 * Material" step already does). Sets the step's Open Page link — the same
 * link the Factory step uses when it has one. Its fields (file, remarks) are
 * optional, so the page's submit can complete it. Runs at server start
 * (lib/scheduler.js) and from /api/one-time-jobs.
 */
import { pool, ensureSchema } from '@/lib/db';
import { extractSpreadsheetId } from '@/lib/fmsSheet';
import { STEP2_URL_RE } from '@/lib/fmsOpenUrl';
import { DESIGN_SHEET_ID, NEW_TAB, designLayout } from '@/lib/designFlow';

const FLAG = 'design_jointing_page';
const key = (v) => String(v || '').trim().toUpperCase();

export async function migrateDesignJointingPage() {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  if (flag.length) return { skipped: 'already done' };

  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const fms = sheets.find((s) => extractSpreadsheetId(s.sheet_id) === DESIGN_SHEET_ID && s.sheet_name === NEW_TAB);
  if (!fms) return { skipped: 'no Design FMS on the new tab' };

  const g = designLayout().groups.find((x) => x.tag === 'Jointing');
  const [allSteps] = await pool.query('SELECT * FROM fms_sheet_steps');
  const step = allSteps.find((s) => String(s.fms_id) === String(fms.id) && key(s.plan_col) === key(g.work.plan));
  if (!step) return { skipped: `no step at ${g.work.plan}` };

  const base = String(process.env.NEXTAUTH_URL || 'https://celestileoffice.com').replace(/\/+$/, '');
  const url = allSteps.map((s) => String(s.open_url || '').trim()).find((u) => /^https?:\/\//i.test(u) && STEP2_URL_RE.test(u))
    || `${base}/inventory?tab=step2`;
  await pool.query('UPDATE fms_sheet_steps SET open_url = ? WHERE id = ?', [url, step.id]);

  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG, new Date().toISOString(), new Date().toISOString()]);
  return { fmsId: fms.id, step: step.step_name, openUrl: url };
}

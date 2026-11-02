/**
 * Design revisions — every time a review or CRM step sent the work back
 * (lib/fmsRework.js). Asked for in the 02-11-2026 meeting: a weekly report
 * of how many revisions each client's orders went through, and whether the
 * designer's mistake (Jibin's review rejected it) or the CRM (client asked
 * for a change) caused them — for the weekly meeting, not a daily message.
 *
 * Append-only, like qc_alerts: the report is a count over these rows.
 */
import { pool, ensureSchema } from '@/lib/db';
import { newId } from '@/lib/ids';

export const revisionSource = (stepName) => (/\bcrm\b/i.test(String(stepName || '')) ? 'CRM' : 'Designer');

// "Step 2C - CRM Approval (2D)" → "2D"; anything else → the step name.
export function revisionStage(stepName) {
  const m = String(stepName || '').match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : String(stepName || '').trim();
}

export async function logRevision({
  orderNo = '', client = '', fmsName = '', stepName = '', designer = '',
  remarks = '', photo = '', raisedBy = '', raisedById = null,
}) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO fms_revisions (id, created_at, order_no, client, fms_name, stage, source, step_name, designer, remarks, photo, raised_by, raised_by_id)
     VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId('REV'), orderNo, client, fmsName, revisionStage(stepName), revisionSource(stepName), stepName,
      designer, remarks, photo, raisedBy, raisedById]
  );
}

// MySQL hands back a Date; the Sheets engine's NOW() is a UTC
// "YYYY-MM-DD HH:MM:SS" with no zone — both out as ISO so the page can bucket
// them into IST weeks.
function isoUtc(v) {
  if (v instanceof Date) return v.toISOString();
  const s = String(v || '');
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? `${s.replace(' ', 'T')}Z` : s;
}

export async function listRevisions() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM fms_revisions');
  return (rows || [])
    .map((r) => ({ ...r, created_at: isoUtc(r.created_at) }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

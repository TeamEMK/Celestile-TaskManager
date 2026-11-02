/**
 * Review / approval steps that send rejected work back to its doer — the
 * Design flow agreed 30-10-2026:
 *
 *   Step 2A  doer works on the 2D drawing
 *   Step 2B  Jibin reviews       — Not approved: he picks the doer, back to 2A
 *   Step 2C  CRM approves        — Not approved: back to 2A, unassigned, so
 *                                  Jibin assigns it again before work resumes
 *
 * and the same for every group (3A/3B/3C …). Wired by step names, so the
 * steps stay editable in the FMS editor: a step named "Step <n><letter> …"
 * with an "Approved?" field (Yes/No) sends a "No" back to "Step <n>A" — or a
 * "Revision?" field, which sends a "Yes" back — and
 * clears the Actual of every step of the group in between, so the reviews
 * come round again.
 *
 * The group's "Step <n> Rejections" column (if the sheet has one) counts the
 * rounds; "Step <n> Last Rejected At" restarts the work step's Planned date
 * (the sheet's formula takes the later of it and the step before).
 */

const STEP_RE = /^\s*step\s*(\d+)\s*([a-z])\b/i;

// "Approved?" sends back on No. "Revision?" (the CRM steps since the 02-11-2026
// meeting) asks the opposite question, so it sends back on Yes — "Revision:
// No" is the approval.
const isRevisionField = (r) => /^revision\s*(required|needed)?\s*\??$/i.test(String(r?.row_label || '').trim());
export const isApprovalField = (r) => isRevisionField(r) || /^approved\s*\??$/i.test(String(r?.row_label || '').trim());
export const isRejection = (v) => /^(no|not approved|rejected?)$/i.test(String(v ?? '').trim());
const isYes = (v) => /^(yes|y)$/i.test(String(v ?? '').trim());
// Does this answer on the step's approval/revision field send the work back?
export const sendsBack = (field, v) => (isRevisionField(field) ? isYes(v) : isRejection(v));

const groupOf = (step) => {
  const m = String(step?.step_name || '').match(STEP_RE);
  return m ? { n: m[1], letter: m[2].toUpperCase() } : null;
};

/**
 * What a "No" on this step undoes, or null when the step doesn't send back:
 * { approvalCol, workStep, clearSteps, countRe, rejectedAtRe }.
 */
export function reworkPlan(step, steps) {
  const g = groupOf(step);
  if (!g || g.letter === 'A') return null;
  const approval = (step.extraRows || []).find(isApprovalField);
  if (!approval) return null;
  const inGroup = (steps || []).filter((s) => {
    const sg = groupOf(s);
    return sg && sg.n === g.n && sg.letter < g.letter;
  });
  const workStep = inGroup.find((s) => groupOf(s).letter === 'A');
  if (!workStep) return null;
  return {
    approvalCol: approval.col_letter,
    approvalField: approval,
    workStep,
    clearSteps: inGroup,
    countRe: new RegExp(`^\\s*step\\s*${g.n}\\s*rejections\\s*$`, 'i'),
    rejectedAtRe: new RegExp(`^\\s*step\\s*${g.n}\\s*last\\s*rejected\\s*at\\s*$`, 'i'),
  };
}

/**
 * Dropdown options written as "@doers:Step 2A" list that step's doers — the
 * "pick the doer" fields of Step 1 and the review steps, which must always
 * offer the current pool rather than a copy typed into the config.
 */
export function expandDoerOptions(extraRows, steps) {
  return (extraRows || []).map((r) => {
    const m = String(r.dropdown_options || '').trim().match(/^@doers:\s*(.+)$/i);
    if (!m) return r;
    const want = m[1].trim().toLowerCase();
    const target = (steps || []).find((s) => String(s.step_name || '').trim().toLowerCase().startsWith(want));
    const names = (target?.doers || []).map((d) => d.name).filter(Boolean);
    return { ...r, field_type: 'dropdown', dropdown_options: names.join(',') };
  });
}

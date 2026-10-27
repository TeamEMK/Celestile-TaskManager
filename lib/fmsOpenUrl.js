// A step's "Open Page on this Step" link, with the row's order number carried
// across as ?orderNo=… — so a step pointing at e.g. /inventory?tab=step2 lands
// on that order already loaded instead of asking the doer to find it in a
// dropdown they have no reason to know the answer to.
//
// Used from the two Mark-Done click handlers (Dashboard, All Tasks) and from
// the manual "Open Form" button inside FmsDoneModal.

import { colKey, isRequiredField } from './fieldVisibility.js';

// Linked pages whose own submit marks the step done (see
// completeLinkedStepRows in lib/fmsSheet.js). Mark Done on such a step goes
// straight to the page — no second form to fill on the dashboard.
export const STEP2_URL_RE = /\/inventory\b[^#]*tab=step2/i;
const SELF_COMPLETING = [STEP2_URL_RE];
export const selfCompletes = (url) => SELF_COMPLETING.some((re) => re.test(String(url || '')));

// The step's Additional Fields as the linked page's submit will answer them:
// a dropdown with one option takes it, otherwise its "done" option (Done /
// Yes / Completed / OK). null when a required field has no such answer —
// that step is left for the doer to finish on the Mark Done form.
const DONE_RE = /^(done|yes|ok|complete|completed)$/i;
export function linkedStepAutoAnswers(extraRows = []) {
  const auto = [];
  for (const r of extraRows || []) {
    const opts = String(r.dropdown_options || '').split(',').map((o) => o.trim()).filter(Boolean);
    const pick = r.field_type === 'dropdown' && (opts.length === 1 ? opts[0] : opts.find((o) => DONE_RE.test(o)));
    if (pick) auto.push({ colLetter: r.col_letter, value: pick });
    else if (isRequiredField(r) && !colKey(r.depends_on)) return null;
  }
  return auto;
}

// Rows arrive in two shapes: the aggregated task ({details: [{header, value}]})
// and the sheet row the modal holds ({data: {header: value}}). Both carry a
// pre-resolved `orderNo` from the server when the sheet has such a column at
// all — the fallback scan only matters for rows built before that landed.
function orderNoOf(rowOrTask) {
  if (!rowOrTask) return '';
  if (rowOrTask.orderNo) return String(rowOrTask.orderNo).trim();
  const pairs = Array.isArray(rowOrTask.details)
    ? rowOrTask.details.map((d) => [d.header, d.value])
    : Object.entries(rowOrTask.data || {});
  const hit = pairs.find(([h]) => /order\s*(no|number|#)/i.test(String(h || '')));
  return hit ? String(hit[1] ?? '').trim() : '';
}

export function stepOpenUrl(url, rowOrTask) {
  const base = String(url || '').trim();
  if (!base) return '';
  const orderNo = orderNoOf(rowOrTask);
  if (!orderNo || /[?&]orderNo=/i.test(base)) return base;
  return `${base}${base.includes('?') ? '&' : '?'}orderNo=${encodeURIComponent(orderNo)}`;
}

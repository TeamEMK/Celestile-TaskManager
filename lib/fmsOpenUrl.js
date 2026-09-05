// A step's "Open Page on this Step" link, with the row's order number carried
// across as ?orderNo=… — so a step pointing at e.g. /inventory?tab=step2 lands
// on that order already loaded instead of asking the doer to find it in a
// dropdown they have no reason to know the answer to.
//
// Used from the two Mark-Done click handlers (Dashboard, All Tasks) and from
// the manual "Open Form" button inside FmsDoneModal.

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

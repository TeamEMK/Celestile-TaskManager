// The FMS sheet and the stock list name the same room differently —
// "KITCHEN AREA" on the order row, "Kitchen" on the slab, "Pooja Room" vs
// "Puja Room". Compare on the letters that matter.
function areaKey(v) {
  return String(v || '').toLowerCase()
    .replace(/pooja/g, 'puja')
    .replace(/\barea\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Rows whose area is the wanted one. An exact match wins; only when there is
// none does a looser "one contains the other" match count — otherwise
// "Bedroom" would also pull in the Master Bedroom's slabs.
export function filterByArea(rows, wanted, areaOf = (r) => r.area) {
  const w = areaKey(wanted);
  if (!w) return rows;
  const exact = rows.filter((r) => areaKey(areaOf(r)) === w);
  if (exact.length) return exact;
  return rows.filter((r) => { const k = areaKey(areaOf(r)); return !!k && (k.includes(w) || w.includes(k)); });
}

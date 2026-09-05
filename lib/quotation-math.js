// Quotation building blocks shared by BOTH branch forms AND the server-side
// PDF (lib/quotation-pdf.js). These used to be pasted into all three files —
// the dangerous kind of duplication: a pricing-rule edit in one form silently
// produced a PDF with different totals. The branch forms' full compute()
// functions stay separate on purpose (the Bangalore and Hyderabad totals
// rules genuinely differ); only the byte-identical primitives live here.

export const MATERIAL_LIST = ['Marble','Granite','Quartzite','Limestone','Travertine','Onyx','Sandstone','Slate','Porcelain','Ceramic','Vitrified','Natural Stone','Engineered Stone'];

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Round a single dimension up to the nearest multiple of 6.
export const roundDim6 = (n) => Math.ceil((Number(n) || 0) / 6) * 6;

// SFT per module: round each dimension to nearest-6, then sq-inches → SFT
// (e.g. 10×10 → 12×12 = 144 sq-in ÷ 144 = 1 SFT).
export const moduleQty = (wt, ht) => (roundDim6(wt) * roundDim6(ht)) / 144;

// A slab-priced ("100 SFT") fixing row bills in whole 100-SFT blocks: up to
// 100 SFT = 1× the rate, 101–200 SFT = 2×, etc. — rate × ceil(SFT/100),
// never a fraction of the rate. Non-slab rows keep plain qty × price.
export function fixAmount(r) {
  const price = parseFloat(r.price) || 0;
  const qty = parseFloat(r.qty) || 0;
  return r.slab ? price * Math.ceil(qty / 100) : price * qty;
}

// H001 → H001-REV1 → H001-REV2 …
export function nextRevRef(ref) {
  const m = String(ref || '').match(/^(.*?)(?:-REV(\d+))?$/i);
  return m[1] + '-REV' + ((m[2] ? parseInt(m[2], 10) : 0) + 1);
}

/**
 * Quotation helpers — ported from the Celestile Quotation Apps Script.
 *
 * The app stores one row per saved quotation (per branch). Revisions reuse the
 * base ref with a `-REV<n>` suffix; on save of a revision we diff against the
 * latest prior version and WhatsApp the change-list (see lib/whatsapp.js).
 *
 * Field shape here is camelCase (the API/frontend shape). The API route maps
 * these to the snake_case DB columns.
 */

export const BRANCHES = {
  bangalore: { label: 'Bangalore', sheet: 'Bangalore' },
  hyderabad: { label: 'Hyderabad', sheet: 'Hyderabad' },
};

export function normalizeBranch(b) {
  const x = String(b || '').toLowerCase();
  return x === 'hyderabad' ? 'hyderabad' : 'bangalore';
}

export function isRevision(refNo) {
  return /-REV\d+/i.test(String(refNo || ''));
}

export function baseRef(refNo) {
  return String(refNo || '').replace(/-REV\d+$/i, '');
}

/* Next ref number for a branch, given all existing refs in that branch.
   Mirrors getNextQuotationNumber: max numeric (ignoring -REVn) + 1, padded to
   3 digits, "HQ-" prefix for Hyderabad. */
export function nextRefNo(existingRefs, branch) {
  const b = normalizeBranch(branch);
  let maxNum = 0;
  (existingRefs || []).forEach((ref) => {
    const m = String(ref || '').trim().match(/(\d+)(?:-REV\d+)?$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  const padded = String(maxNum + 1).padStart(3, '0');
  return (b === 'hyderabad' ? 'HQ-' : '') + padded;
}

/* ── change-list helpers (ported verbatim in behaviour) ────────────────── */
const _truncate = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.substring(0, n) + '…' : s; };
const _norm = (v) => String(v == null ? '' : v).trim();

function compareStoneItems(prev, curr) {
  const out = [];
  const maxLen = Math.max(prev.length, curr.length);
  for (let i = 0; i < maxLen; i++) {
    const p = prev[i], c = curr[i];
    if (!p && c) {
      out.push('  ➕ Added: ' + _truncate(c.desc || c.mat || ('Item ' + (i + 1)), 30));
    } else if (p && !c) {
      out.push('  ➖ Removed: ' + _truncate(p.desc || p.mat || ('Item ' + (i + 1)), 30));
    } else if (p && c) {
      const diffs = [];
      if (_norm(p.desc) !== _norm(c.desc)) diffs.push('desc');
      if ((+p.price || 0) !== (+c.price || 0)) diffs.push('rate ₹' + (p.price || 0) + '→₹' + (c.price || 0));
      if ((+p.qty   || 0) !== (+c.qty   || 0)) diffs.push('qty ' + (p.qty || 0) + '→' + (c.qty || 0));
      if ((+p.gst   || 0) !== (+c.gst   || 0)) diffs.push('gst ' + (p.gst || 0) + '%→' + (c.gst || 0) + '%');
      if (_norm(p.mat)  !== _norm(c.mat))  diffs.push('mat ' + (p.mat  || '—') + '→' + (c.mat  || '—'));
      if (_norm(p.thk)  !== _norm(c.thk))  diffs.push('thk ' + (p.thk  || '—') + '→' + (c.thk  || '—'));
      if (_norm(p.size) !== _norm(c.size)) diffs.push('size');
      if (_norm(p.area) !== _norm(c.area)) diffs.push('area ' + (p.area || '—') + '→' + (c.area || '—'));
      if (_norm(p.unit) !== _norm(c.unit)) diffs.push('unit');
      if (diffs.length) out.push('  • ' + _truncate(c.desc || c.mat || ('Item ' + (i + 1)), 22) + ': ' + diffs.join(', '));
    }
  }
  return out;
}

function compareTotalsConfig(prev, curr) {
  const out = [], prevMap = {}, seen = {};
  (prev || []).forEach((t) => { if (t && t.id) prevMap[t.id] = t; });
  (curr || []).forEach((t) => {
    if (!t || !t.id) return;
    seen[t.id] = true;
    const p = prevMap[t.id];
    if (!p) {
      if ((+t.value || 0) > 0 || (+t.area || 0) > 0) out.push('  ➕ Added charge: ' + (t.label || t.id));
      return;
    }
    const oldV = +p.value || 0, newV = +t.value || 0, oldA = +p.area || 0, newA = +t.area || 0;
    if (oldV !== newV || oldA !== newA) {
      if (t.type === 'rate-area') out.push('  • ' + (t.label || t.id) + ': area ' + oldA + '→' + newA + ' (₹' + oldV + '→₹' + newV + ')');
      else if (t.type === 'manual-discount') out.push('  • Discount: ' + oldV + '%→' + newV + '%');
      else out.push('  • ' + (t.label || t.id) + ': ₹' + oldV + '→₹' + newV);
    }
  });
  Object.keys(prevMap).forEach((id) => {
    if (!seen[id]) {
      const p = prevMap[id];
      if ((+p.value || 0) > 0 || (+p.area || 0) > 0) out.push('  ➖ Removed charge: ' + (p.label || id));
    }
  });
  return out;
}

function compareFixingItems(prev, curr) {
  const out = [];
  if (!Array.isArray(prev)) prev = [];
  if (!Array.isArray(curr)) curr = [];
  if (prev.length !== curr.length) out.push('  • Fixing item count: ' + prev.length + ' → ' + curr.length);
  const maxLen = Math.max(prev.length, curr.length);
  for (let i = 0; i < maxLen; i++) {
    const p = prev[i], c = curr[i];
    if (p && c) {
      if ((+p.qty   || 0) !== (+c.qty   || 0)) out.push('  • ' + _truncate(c.col1 || ('Fixing ' + (i + 1)), 22) + ': qty ' + (p.qty || 0) + '→' + (c.qty || 0));
      if ((+p.price || 0) !== (+c.price || 0)) out.push('  • ' + _truncate(c.col1 || ('Fixing ' + (i + 1)), 22) + ': rate ₹' + (p.price || 0) + '→₹' + (c.price || 0));
    }
  }
  return out;
}

// Scalar fields diffed per branch (camelCase keys, as the API shape).
const FIELDS_BNG = [
  ['clientName', 'Client Name'], ['architectName', 'Architect Name'], ['architectFirm', 'Architect Firm'],
  ['consultant', 'Consultant'], ['consultantNumber', 'Consultant Number'], ['consultantEmail', 'Consultant Email'],
  ['clientContact', 'Client Contact'], ['clientEmail', 'Client Email'], ['boutique', 'Boutique'],
  ['paymentTerms', 'Payment Terms'], ['leadTime', 'Lead Time'], ['billingAddress', 'Billing Address'],
  ['siteAddress', 'Site Address'], ['grandTotal', 'Grand Total'],
];
const FIELDS_HYD = [
  ['clientName', 'Client Name'], ['clientFirm', 'Client Firm'], ['consultant', 'Consultant'],
  ['architect', 'Architect'], ['clientContact', 'Client Contact'], ['clientEmail', 'Client Email'],
  ['pan', 'PAN'], ['boutique', 'Boutique'], ['paymentTerms', 'Payment Terms'], ['leadTime', 'Lead Time'],
  ['transport', 'Transport'], ['billingAddress', 'Billing Address'], ['siteAddress', 'Site Address'],
  ['grandTotal', 'Grand Total'], ['consultantNumber', 'Consultant No.'], ['discountPct', 'Discount %'],
  ['consultantEmail', 'Consultant Email'], ['designFees', 'Design Fees'], ['installationCharges', 'Installation Charges'],
];

/* Branch-aware change list between two quotation objects (prev, curr). */
export function buildChangeList(prev, curr, branch) {
  const b = normalizeBranch(branch);
  const changes = [];
  const fields = b === 'hyderabad' ? FIELDS_HYD : FIELDS_BNG;

  fields.forEach(([key, label]) => {
    const oldVal = _norm(prev[key]);
    const newVal = _norm(curr[key]);
    if (oldVal !== newVal) {
      changes.push('• ' + label + ': "' + _truncate(oldVal, 28) + '" → "' + _truncate(newVal, 28) + '"');
    }
  });

  const itemDiffs = compareStoneItems(prev.stoneItems || [], curr.stoneItems || []);
  if (itemDiffs.length) { changes.push('• Items:'); changes.push(...itemDiffs); }

  if (b === 'hyderabad') {
    const fixDiffs = compareFixingItems(prev.fixingItems || [], curr.fixingItems || []);
    if (fixDiffs.length) { changes.push('• Fixing:'); changes.push(...fixDiffs); }
  } else {
    const totalsDiffs = compareTotalsConfig(prev.totalsConfig || [], curr.totalsConfig || []);
    if (totalsDiffs.length) { changes.push('• Charges:'); changes.push(...totalsDiffs); }
  }

  return changes;
}

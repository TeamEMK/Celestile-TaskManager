/**
 * Server-side quotation PDF generator using pdf-lib (pure ESM, no Puppeteer).
 * pdf-lib: https://pdf-lib.js.org
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// A4 page dimensions in points
const PW = 595.28, PH = 841.89, PM = 36; // page width, height, margin
const CW = PW - 2 * PM;                  // content width = 523.28

// Colours
const GOLD  = rgb(201/255, 169/255, 110/255);
const DARK  = rgb(0.10, 0.10, 0.18);
const LGRAY = rgb(0.50, 0.50, 0.50);
const ZEBRA = rgb(0.97, 0.97, 0.97);
const WHITE = rgb(1, 1, 1);
const RULE  = rgb(0.82, 0.82, 0.82);

const parseJ = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const DEFAULT_GST = 18;

const roundDim6 = (n) => Math.ceil((Number(n) || 0) / 6) * 6;
function stoneQty(r) {
  if (r.module) {
    const wt = parseFloat(r.sizeWt || String(r.size || '').split(/[x×*\s]+/i)[0]) || 0;
    const ht = parseFloat(r.sizeHt || String(r.size || '').split(/[x×*\s]+/i)[1]) || 0;
    return (roundDim6(wt) * roundDim6(ht)) / 144;
  }
  return parseFloat(r.qty) || 0;
}

// Bangalore charges/GST breakdown — mirrors compute() in app/quotation/BangaloreForm.jsx
function computeBangaloreCharges(stone, totalsConfig) {
  const rowData = stone.map((r) => {
    const price = parseFloat(r.price) || 0, qty = stoneQty(r);
    return { gross: price * qty, gstPct: parseFloat(r.gst) || 0 };
  });
  const basicSale = rowData.reduce((s, r) => s + r.gross, 0);

  let discountPct = 0, chargesSum = 0;
  const lines = [];
  totalsConfig.forEach((rc) => {
    if (rc.type === 'manual-discount') discountPct = parseFloat(rc.value) || 0;
    else if (rc.type === 'manual') { const v = parseFloat(rc.value) || 0; if (v > 0) lines.push([rc.label || rc.id, v]); chargesSum += v; }
    else if (rc.type === 'rate-area') { const v = (rc.rate || 0) * (parseFloat(rc.area) || 0); if (v > 0) lines.push([rc.label || rc.id, v]); chargesSum += v; }
  });
  let discount = basicSale * discountPct / 100;
  if (discount > basicSale) discount = basicSale;

  let totalGst = 0, weightedGstNumer = 0;
  rowData.forEach((rd) => {
    const share = basicSale > 0 ? rd.gross / basicSale : 0;
    const taxable = rd.gross - discount * share;
    totalGst += taxable * (rd.gstPct / 100);
    weightedGstNumer += rd.gross * rd.gstPct;
  });
  const avgGst = basicSale > 0 ? weightedGstNumer / basicSale : DEFAULT_GST;
  totalGst += chargesSum * (avgGst / 100);

  const subTotal = (basicSale - discount) + chargesSum;
  return { basicSale, discountPct, discount, chargeLines: lines, totalGst, subTotal };
}

// Hyderabad charges/GST breakdown — mirrors compute() in app/quotation/HyderabadForm.jsx
function computeHyderabadCharges(stone, fixing, q) {
  let stoneSum = 0, grossGst = 0;
  stone.forEach((r) => {
    const p = parseFloat(r.price) || 0, qty = stoneQty(r), gst = parseFloat(r.gst) || 0;
    stoneSum += p * qty; grossGst += p * qty * gst / 100;
  });
  const discPct = parseFloat(q.discount_pct) || 0;
  const discAmt = stoneSum * discPct / 100;
  const netStone = stoneSum - discAmt;
  const netGst = grossGst * (1 - discPct / 100);
  const designFees = parseFloat(q.design_fees) || 0;
  const totalGst = netGst + designFees * DEFAULT_GST / 100;
  const installation = parseFloat(q.installation_charges) || 0;
  const packing = parseFloat(q.packing_charges) || 0;
  const swg = netStone + designFees + totalGst;
  const fixSum = fixing.reduce((s, r) => s + (parseFloat(r.price) || 0) * (parseFloat(r.qty) || 0), 0);
  return { stoneSum, discPct, discAmt, netStone, designFees, totalGst, swg, fixSum, installation, packing };
}

const BNG_TERMS = [
  'Payment Terms: A 60% advance is required upon order confirmation. The remaining 40% before delivery.',
  'Order Policy: Once booked, products cannot be returned, exchanged, or cancelled.',
  'Delivery & Transportation: Dispatched from our local warehouse; transportation charges based on delivery location.',
  'Measurement Changes: Quotation revised as per actual site measurements.',
  'Site Visit Charges: Additional charges apply for site visits outside Bengaluru.',
  'Legal Jurisdiction: Disputes fall under the jurisdiction of Bengaluru, Karnataka.',
  'Quotation Validity: Valid for 30 days from the date of issue.',
  'Product Issues: Complaints must be reported within 24 hours of delivery if installation is not in Celestile scope.',
  'Additional Charges: Transportation, loading, unloading, installation billed separately.',
  'Installation Condition: Stone can be installed only on a cement-plastered wall.',
  'Transit Tolerance: A standard transit damage margin of 5-7% is acceptable.',
  'Design Iteration: Up to three drawing changes without additional fee.',
  'Delivery Timeline: Estimated 40 to 60 days from order confirmation.',
  'Storage Responsibility: If installation is delayed, client is responsible for safe storage.',
];
const HYD_TERMS = [
  'Quotation valid for 30 days from date of issue.',
  '80% advance against order confirmation; balance 20% before delivery.',
  'Payment via Cheque / DD / Transfer in favour of SK Marketing Tiles And Tapz.',
  'Products once booked cannot be returned, exchanged or cancelled.',
  'All disputes subject to Hyderabad, Telangana jurisdiction only.',
  'Delivery 40-60 working days from drawing confirmation.',
  'Products delivered from Factory @ Jadcherla; local transport extra.',
  'Natural stones have 15-20% variation in colour & size.',
  'Complaints must be reported within 24 hours of delivery.',
  'Stone can only be installed on a cement-plastered wall.',
  'Transit damage margin of 5-7% is acceptable within industry norms.',
  'If material is ready for dispatch, the client must issue full payment.',
  'Celestile will hold ready material for only 15 days; beyond which 2% of bill value/month storage applies.',
];

export async function generateQuotationPdf(q) {
  const doc = await PDFDocument.create();
  const F  = await doc.embedFont(StandardFonts.Helvetica);
  const FB = await doc.embedFont(StandardFonts.HelveticaBold);

  const stone  = parseJ(q.stone_items).filter(r => r.desc || r.price);
  const fixing = parseJ(q.fixing_items).filter(r => Number(r.qty) > 0);
  const branchLabel = String(q.branch || '').toLowerCase() === 'hyderabad' ? 'Hyderabad' : 'Bangalore';

  // ── Page state (top-down cursor) ──────────────────────────
  let pg, yt; // current page object, y-from-top cursor

  function newPage() {
    pg = doc.addPage([PW, PH]);
    yt = 0;
    pg.drawText(`Celestile · ${branchLabel} · ${q.ref_no || ''}`, {
      x: PM, y: 20, size: 7, font: F, color: LGRAY,
    });
  }

  // pdf-lib uses bottom-up Y; this converts our top-down cursor + offset
  const ay = (offset = 0) => PH - PM - yt - offset;

  function need(h) { if (yt + h > PH - 2 * PM) newPage(); }

  // WinAnsi (Helvetica) doesn't support ₹ (U+20B9) — replace with Rs.
  const safe = (s) => String(s ?? '').replace(/₹\s*/g, 'Rs. ').replace(/—/g, '-').replace(/[^\x00-\xFF]/g, '?');

  function t(str, x, yOff, sz, font, color) {
    const s = safe(str);
    if (!s) return;
    pg.drawText(s.slice(0, 100), { x, y: ay(yOff), size: sz ?? 8.5, font: font ?? F, color: color ?? DARK });
  }

  newPage();

  // ── 1. Brand header ───────────────────────────────────────
  t('CELESTILE', PM, 0, 20, FB, DARK);
  t('QUOTATION', PW - PM - FB.widthOfTextAtSize('QUOTATION', 15), 0, 15, FB, DARK);
  yt += 22;
  t('The Home & Bath Boutique', PM, 0, 8, F, GOLD);
  const refStr = `Ref: ${q.ref_no || '—'}`;
  t(refStr, PW - PM - F.widthOfTextAtSize(refStr, 8), 0, 8, F, LGRAY);
  yt += 11;
  t(branchLabel, PM, 0, 7.5, F, LGRAY);
  yt += 13;

  // Gold rule
  pg.drawLine({ start: { x: PM, y: ay() }, end: { x: PW - PM, y: ay() }, thickness: 1.5, color: GOLD });
  yt += 10;

  // ── 2. Info columns ───────────────────────────────────────
  const HALF = CW / 2 - 8;

  function infoBlock(title, pairs, xOrig) {
    const startYt = yt;
    pg.drawText(title, { x: xOrig, y: ay(), size: 8, font: FB, color: GOLD });
    let ly = startYt + 12;
    for (const [lbl, val] of pairs) {
      if (!val) continue;
      pg.drawText(safe(lbl) + ':', { x: xOrig, y: PH - PM - ly, size: 7.5, font: F, color: LGRAY });
      pg.drawText(safe(val).slice(0, 52), { x: xOrig + 60, y: PH - PM - ly, size: 7.5, font: F, color: DARK });
      ly += 11;
    }
    return ly - startYt;
  }

  const lh = infoBlock('Client Details', [
    ['Name',    q.client_name],
    ['Firm',    q.client_firm],
    ['Contact', q.client_contact],
    ['Email',   q.client_email],
    ['Site',    q.site_address],
  ], PM);

  const rh = infoBlock('Quotation Details', [
    ['Boutique',   q.boutique],
    ['Validity',   q.validity],
    ['Lead Time',  q.lead_time],
    ['Consultant', q.consultant],
    ['Architect',  q.architect_name || q.architect],
    ['Transport',  q.transport],
  ], PM + HALF + 20);

  yt += Math.max(lh, rh) + 12;

  // ── 3. Tables ─────────────────────────────────────────────
  const RH = 16; // row height in points

  function drawTable(title, headers, colW, dataRows) {
    need(32 + Math.min(dataRows.length + 1, 5) * RH);
    t(title, PM, 0, 9, FB, DARK); yt += 14;

    const TW = colW.reduce((a, b) => a + b, 0);

    // header row background + text
    pg.drawRectangle({ x: PM, y: ay() - RH + 5, width: TW, height: RH, color: DARK });
    let hx = PM + 4;
    headers.forEach((h, i) => {
      pg.drawText(h, { x: hx, y: ay() - RH + 7, size: 7, font: FB, color: WHITE });
      hx += colW[i];
    });
    yt += RH;

    // data rows
    dataRows.forEach((row, ri) => {
      need(RH + 2);
      if (ri % 2 === 1)
        pg.drawRectangle({ x: PM, y: ay() - RH + 5, width: TW, height: RH, color: ZEBRA });
      pg.drawLine({ start: { x: PM, y: ay() - RH + 5 }, end: { x: PM + TW, y: ay() - RH + 5 }, thickness: 0.3, color: RULE });

      let dx = PM + 4;
      row.forEach((cell, ci) => {
        const s  = safe(cell).slice(0, 48);
        const sz = 7.5;
        const isRight = ci >= row.length - 2;
        const isLast  = ci === row.length - 1;
        const tw = (isRight ? (isLast ? FB : F) : F).widthOfTextAtSize(s, sz);
        const cx = isRight ? dx + colW[ci] - tw - 6 : dx;
        pg.drawText(s, { x: cx, y: ay() - RH + 7, size: sz, font: isLast ? FB : F, color: DARK });
        dx += colW[ci];
      });
      yt += RH;
    });
    yt += 12;
  }

  // Stone items — cols total = CW = 523
  if (stone.length) {
    drawTable(
      'Stone / Material Selections',
      ['#', 'Description', 'Area', 'Size', 'Material', 'Qty', 'Rate', 'Amount'],
      [20, 210, 30, 45, 75, 28, 55, 60],
      stone.map((r, i) => {
        const p = parseFloat(r.price) || 0, qty = stoneQty(r);
        const mat = [r.mat, r.thk].filter(Boolean).join('/') || '—';
        return [
          i + 1, r.desc || '—', r.area || '—', r.size || '—', mat, qty || '—',
          p ? `₹${p.toLocaleString('en-IN')}` : '—',
          p && qty ? `₹${(p * qty).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—',
        ];
      })
    );
  }

  // Fixing items — cols total = CW = 523
  if (fixing.length) {
    drawTable(
      'Fixing / Labour',
      ['#', 'Description', 'Material', 'Size', 'Unit', 'Qty', 'Amount'],
      [20, 230, 75, 48, 40, 32, 78],
      fixing.map((r, i) => {
        const p = parseFloat(r.price) || 0, qty = parseFloat(r.qty) || 0;
        return [
          i + 1, r.desc || '—', r.mat || '—', r.size || '—', r.unit || '—', qty,
          `₹${(p * qty).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        ];
      })
    );
  }

  // ── 4. Charges / GST breakdown ─────────────────────────────
  const isHyd = branchLabel === 'Hyderabad';
  const chargeRows = [];
  if (isHyd) {
    const c = computeHyderabadCharges(stone, fixing, q);
    chargeRows.push(['Basic Sale Value (Stone)', c.stoneSum]);
    if (c.discAmt > 0) { chargeRows.push([`Discount @ ${c.discPct}%`, -c.discAmt]); chargeRows.push(['Net Stone Value', c.netStone]); }
    if (c.designFees > 0) chargeRows.push(['Design Fees (Concept)', c.designFees]);
    chargeRows.push(['GST (Total)', c.totalGst]);
    if (c.fixSum > 0) chargeRows.push(['Fixing Material Total', c.fixSum]);
    if (c.installation > 0) chargeRows.push(['Installation Charges', c.installation]);
    if (c.packing > 0) chargeRows.push(['Packing Charges', c.packing]);
  } else {
    const totalsConfig = parseJ(q.totals_config);
    const c = computeBangaloreCharges(stone, totalsConfig);
    chargeRows.push(['Basic Sale Value', c.basicSale]);
    if (c.discount > 0) chargeRows.push([`Discount @ ${c.discountPct}%`, -c.discount]);
    c.chargeLines.forEach(([label, v]) => chargeRows.push([label, v]));
    chargeRows.push(['Sub Total', c.subTotal]);
    if (c.totalGst > 0) chargeRows.push(['GST (as applicable)', c.totalGst]);
  }
  if (chargeRows.length) {
    need(20 + chargeRows.length * 13);
    t('Charges & Summary', PM, 0, 9, FB, DARK); yt += 14;
    chargeRows.forEach(([label, amt]) => {
      need(13);
      const neg = amt < 0;
      const amtStr = (neg ? '- ' : '') + `₹${Math.abs(amt).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
      t(label, PM + 4, 0, 8, F, LGRAY);
      const w = F.widthOfTextAtSize(safe(amtStr), 8);
      t(amtStr, PW - PM - w - 4, 0, 8, F, neg ? rgb(0.6, 0.2, 0.1) : DARK);
      yt += 13;
    });
    yt += 6;
  }

  // ── 5. Grand total ────────────────────────────────────────
  need(38);
  yt += 4;
  const gt = safe(q.grand_total || '-');
  const gtBoxW = 230, gtH = 22, gtX = PW - PM - gtBoxW;

  pg.drawLine({ start: { x: gtX, y: ay() },       end: { x: PW - PM, y: ay() },       thickness: 1.5, color: GOLD });
  pg.drawLine({ start: { x: gtX, y: ay() - gtH }, end: { x: PW - PM, y: ay() - gtH }, thickness: 1.5, color: GOLD });
  pg.drawText('GRAND TOTAL', { x: gtX + 6, y: ay() - gtH + 7, size: 10, font: FB, color: DARK });
  const gtw = FB.widthOfTextAtSize(gt, 10);
  pg.drawText(gt, { x: PW - PM - gtw - 6, y: ay() - gtH + 7, size: 10, font: FB, color: GOLD });
  yt += gtH + 16;

  // ── 6. Payment terms ──────────────────────────────────────
  if (q.payment_terms) {
    need(34);
    pg.drawLine({ start: { x: PM, y: ay() }, end: { x: PW - PM, y: ay() }, thickness: 0.5, color: RULE });
    yt += 8;
    t('Payment Terms', PM, 0, 8, FB, GOLD); yt += 12;
    t(String(q.payment_terms).slice(0, 220), PM, 0, 8, F, LGRAY);
    yt += 14;
  }

  // ── 7. Terms & Conditions ──────────────────────────────────
  const terms = isHyd ? HYD_TERMS : BNG_TERMS;
  need(30);
  pg.drawLine({ start: { x: PM, y: ay() }, end: { x: PW - PM, y: ay() }, thickness: 0.5, color: RULE });
  yt += 8;
  t('Terms & Conditions', PM, 0, 8, FB, GOLD); yt += 12;
  terms.forEach((term) => {
    const lines = wrapText('- ' + term, F, 7.5, CW - 8);
    lines.forEach((line, li) => {
      need(11);
      const x = PM + (li ? 8 : 0);
      pg.drawText(safe(line), { x, y: ay(), size: 7.5, font: F, color: LGRAY });
      yt += 11;
    });
  });

  return Buffer.from(await doc.save());
}

// Break `text` into lines that fit `maxWidth` at `size` with `font`.
function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  words.forEach((w) => {
    const test = cur ? cur + ' ' + w : w;
    if (cur && font.widthOfTextAtSize(test, size) > maxWidth) { lines.push(cur); cur = w; }
    else cur = test;
  });
  if (cur) lines.push(cur);
  return lines;
}

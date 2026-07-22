/**
 * Server-side quotation PDF generator using pdf-lib (pure ESM, no Puppeteer).
 * pdf-lib: https://pdf-lib.js.org
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { CELESTILE_LOGO } from './celestile-logo';

// A4 page dimensions in points
const PW = 595.28, PH = 841.89, PM = 36; // page width, height, margin
const CW = PW - 2 * PM;                  // content width = 523.28

// Colours — matches the brand palette used in the in-app print preview
// (buildPdfHtml in BangaloreForm.jsx / HyderabadForm.jsx): dark green header/
// footer bars and table headers, gold accents, warm near-black body text.
const GREEN      = rgb(36/255, 48/255, 32/255);   // #243020 — Bangalore brand colour
const BLUE       = rgb(34/255, 64/255, 154/255);  // #22409A — Hyderabad brand colour
const GOLD       = rgb(176/255, 141/255, 87/255); // #b08d57
const GOLD_LIGHT = rgb(212/255, 180/255, 131/255);// #d4b483 — gold text on green bg
const DARK  = rgb(42/255, 34/255, 24/255);        // #2a2218
const LGRAY = rgb(122/255, 110/255, 96/255);      // #7a6e60
const ZEBRA = rgb(250/255, 247/255, 242/255);     // #faf7f2
const WHITE = rgb(1, 1, 1);
const RULE  = rgb(217/255, 207/255, 192/255);     // #d9cfc0

const parseJ = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const DEFAULT_GST = 18;

// Node's Buffer.from(base64) often slices a shared, oversized pool buffer
// (Buffer.poolSize, 8KB by default) — pdf-lib's JPEG parser reads byte 0 of
// `.buffer` directly (ignoring byteOffset), so it can end up reading garbage
// from the pool instead of the image and throw "SOI not found in JPEG" for
// small images. Uint8Array.from() always allocates its own exact-size
// buffer, sidestepping that.
const b64ToBytes = (b64) => Uint8Array.from(Buffer.from(b64 || '', 'base64'));

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return String(s);
  return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

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

// Kept verbatim in sync with the Terms & Conditions shown in the in-app print
// preview (buildPdfHtml in BangaloreForm.jsx / HyderabadForm.jsx) — this is the
// PDF actually delivered to clients over WhatsApp, so any edit to one must be
// mirrored in the other.
const BNG_TERMS = [
  'Payment Terms: A 60% advance is required upon order confirmation. The remaining 40% before delivery.',
  'Order Policy: Once booked, products cannot be returned, exchanged, or cancelled.',
  'Delivery & Transportation: Dispatched from our local warehouse. Transportation charges based on delivery location.',
  'Measurement Changes: Quotation revised as per actual site measurements.',
  'Site Visit Charges: Additional charges apply for site visits outside Bengaluru.',
  'Legal Jurisdiction: Disputes fall under the jurisdiction of Bengaluru, Karnataka.',
  'Quotation Validity: Valid for 30 days from the date of issue.',
  "Product Issues: Complaints must be reported within 24 hours of delivery if installation is not in Celestile's scope.",
  'Additional Charges: Transportation, loading, unloading, installation billed separately.',
  'Installation Condition: Stone can be installed only on a cement-plastered wall.',
  'Transit Tolerance: A standard transit damage margin of 5-7% is acceptable.',
  'Delivery Schedule: Material delivered within 48 hours upon receipt of payment.',
  'Design Iteration: Up to three drawing changes without additional fee.',
  'Delivery Timeline: Estimated 40 to 60 days from order confirmation.',
  'Storage Responsibility: If installation is delayed, client is responsible for safe storage.',
  'Studio Timings: Monday-Saturday 9:30 am-7:30 pm. Closed Sundays.',
];
const HYD_TERMS = [
  'Quotation valid for 30 days from date of issue.',
  '80% Advance against order confirmation. Balance 20% before delivery.',
  'Payment via Cheque / DD / Transfer in favor of SK Marketing Tiles And Tapz.',
  'Products once booked cannot be returned, exchanged or cancelled.',
  'All disputes subject to Hyderabad, Telangana jurisdiction only.',
  'Delivery 40-60 working days from drawing confirmation.',
  'Products delivered from Factory @ Jadcherla; local transport extra.',
  'Natural stones have 15-20% variation in color & size.',
  'Complaints within 24 hours of delivery.',
  'Stone can only be installed on a cement-plastered wall.',
  'Transit damage margin of 5-7% is acceptable within industry norms.',
  'If material is ready for dispatch, the client must issue full payment.',
  'Celestile will hold ready material for only 15 days; beyond which 2% of bill value/month storage applies.',
];

export async function generateQuotationPdf(q) {
  const doc = await PDFDocument.create();
  const F  = await doc.embedFont(StandardFonts.Helvetica);
  const FB = await doc.embedFont(StandardFonts.HelveticaBold);

  let logoImg = null;
  try {
    logoImg = await doc.embedJpg(b64ToBytes(CELESTILE_LOGO.split(',')[1]));
  } catch { logoImg = null; }

  const stone  = parseJ(q.stone_items).filter(r => r.desc || r.price);
  const fixing = parseJ(q.fixing_items).filter(r => Number(r.qty) > 0);
  const isHydBranch = String(q.branch || '').toLowerCase() === 'hyderabad';
  const branchLabel = isHydBranch ? 'Hyderabad' : 'Bangalore';
  // Each branch keeps its own brand colour (mirrors buildPdfHtml in
  // BangaloreForm.jsx / HyderabadForm.jsx) — gold accents are shared.
  const BRAND = isHydBranch ? BLUE : GREEN;
  const FOOTER_LINES = isHydBranch
    ? ['Celestile · The Home & Bath Boutique  |  www.celestile.com',
       'SHAMSHABAD, HYDERABAD: +91 800 800 2700  |  SARJAPUR ROAD, BANGALORE: +91 080 2665 8884']
    : ['Celestile · The Home & Bath Boutique  |  www.celestile.com',
       'BANGALORE: SARJAPUR MAIN ROAD  |  +91 9008882854'];

  // ── Page state (top-down cursor) ──────────────────────────
  let pg, yt; // current page object, y-from-top cursor
  const FOOTER_H = 30;

  function newPage() {
    pg = doc.addPage([PW, PH]);
    yt = 0;
    pg.drawRectangle({ x: 0, y: 0, width: PW, height: FOOTER_H, color: BRAND });
    pg.drawRectangle({ x: 0, y: FOOTER_H, width: PW, height: 2, color: GOLD });
    FOOTER_LINES.forEach((line, i) => {
      const w = F.widthOfTextAtSize(line, 6.5);
      pg.drawText(line, { x: (PW - w) / 2, y: FOOTER_H - 11 - i * 9, size: 6.5, font: F, color: i === 0 ? GOLD_LIGHT : GOLD });
    });
  }

  // pdf-lib uses bottom-up Y; this converts our top-down cursor + offset
  const ay = (offset = 0) => PH - PM - yt - offset;

  function need(h) { if (yt + h > PH - FOOTER_H - PM - 6) newPage(); }

  // WinAnsi (Helvetica) doesn't support ₹ (U+20B9), en/em dashes, or curly quotes —
  // normalize those to ASCII before the catch-all turns anything else into '?'.
  const safe = (s) => String(s ?? '')
    .replace(/₹\s*/g, 'Rs. ')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x00-\xFF]/g, '?');

  function t(str, x, yOff, sz, font, color) {
    const s = safe(str);
    if (!s) return;
    pg.drawText(s.slice(0, 100), { x, y: ay(yOff), size: sz ?? 8.5, font: font ?? F, color: color ?? DARK });
  }

  newPage();

  // ── 1. Brand header — full-bleed brand-colour bar, logo medallion, ref badge ──
  const HEADER_H = 86;
  const hBottom = PH - HEADER_H, hMid = hBottom + HEADER_H / 2;
  pg.drawRectangle({ x: 0, y: hBottom, width: PW, height: HEADER_H, color: BRAND });
  pg.drawRectangle({ x: 0, y: hBottom - 3, width: PW, height: 3, color: GOLD });

  const logoR = 24;
  if (logoImg) {
    const s = (logoR * 1.9) / Math.max(logoImg.width, logoImg.height);
    const iw = logoImg.width * s, ih = logoImg.height * s;
    pg.drawImage(logoImg, { x: PM + logoR - iw / 2, y: hMid - ih / 2, width: iw, height: ih });
    pg.drawCircle({ x: PM + logoR, y: hMid, size: logoR, borderWidth: 1.2, borderColor: GOLD });
  }
  const textX = PM + logoR * 2 + 16;
  pg.drawText(safe('CELESTILE'), { x: textX, y: hMid + 3, size: 19, font: FB, color: GOLD_LIGHT });
  pg.drawText(safe('THE HOME & BATH BOUTIQUE'), { x: textX, y: hMid - 14, size: 6.5, font: F, color: GOLD });

  const dt = 'QUOTATION';
  pg.drawText(dt, { x: PW - PM - FB.widthOfTextAtSize(dt, 14), y: hMid + 7, size: 14, font: FB, color: GOLD_LIGHT });
  const refStr = safe(`REF: ${q.ref_no || '-'}`);
  const refTW = F.widthOfTextAtSize(refStr, 7.5);
  const refBoxW = refTW + 16, refBoxH = 15, refBoxX = PW - PM - refBoxW, refBoxY = hMid - 23;
  pg.drawRectangle({ x: refBoxX, y: refBoxY, width: refBoxW, height: refBoxH, color: GOLD, opacity: 0.14, borderColor: GOLD, borderWidth: 0.75, borderOpacity: 0.6 });
  pg.drawText(refStr, { x: refBoxX + 8, y: refBoxY + 4.5, size: 7.5, font: F, color: GOLD_LIGHT });

  yt = HEADER_H + 14; // continue below the header bar using the normal cursor

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
    ['Date',       fmtDate(q.quote_date)],
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

  function drawTable(title, headers, colW, dataRows, opts = {}) {
    const { imageColIndex = -1, images = [] } = opts;
    need(32 + Math.min(dataRows.length + 1, 5) * RH);
    t(title, PM, 0, 9, FB, DARK); yt += 14;

    const TW = colW.reduce((a, b) => a + b, 0);

    // header row background + text
    pg.drawRectangle({ x: PM, y: ay() - RH + 5, width: TW, height: RH, color: BRAND });
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

      let dx = PM;
      row.forEach((cell, ci) => {
        if (ci === imageColIndex) {
          const img = images[ri];
          if (img) {
            const box = RH - 4;
            const scale = Math.min(box / img.width, box / img.height, 1);
            const iw = img.width * scale, ih = img.height * scale;
            pg.drawImage(img, {
              x: dx + (colW[ci] - iw) / 2,
              y: ay() - RH + 5 + (RH - ih) / 2,
              width: iw, height: ih,
            });
          }
          dx += colW[ci];
          return;
        }
        const sz = 7.5;
        const isRight = ci >= row.length - 2;
        const isLast  = ci === row.length - 1;
        const font = isRight ? (isLast ? FB : F) : F;
        const s = truncateToWidth(safe(cell).slice(0, 48), font, sz, colW[ci] - 8);
        const tw = font.widthOfTextAtSize(s, sz);
        const cx = isRight ? dx + colW[ci] - tw - 6 : dx + 4;
        pg.drawText(s, { x: cx, y: ay() - RH + 7, size: sz, font, color: DARK });
        dx += colW[ci];
      });
      yt += RH;
    });
    yt += 12;
  }

  // Embed each stone item's thumbnail (always a JPEG data-URI from
  // fileToThumbnail) up front — pdf-lib embedding is async, drawTable isn't.
  const stoneImages = [];
  for (const r of stone) {
    if (!r.img) { stoneImages.push(null); continue; }
    try {
      const bytes = b64ToBytes(String(r.img).split(',')[1]);
      stoneImages.push(await doc.embedJpg(bytes));
    } catch {
      stoneImages.push(null);
    }
  }

  // Stone items — cols total = CW = 523 (Rate intentionally omitted — client-facing
  // documents show only the line Amount, never the per-unit rate)
  if (stone.length) {
    drawTable(
      'Stone / Material Selections',
      ['#', 'Img', 'Description', 'Area', 'Size', 'Material', 'Qty', 'Amount'],
      [18, 24, 166, 52, 57, 83, 33, 90],
      stone.map((r, i) => {
        const p = parseFloat(r.price) || 0, qty = stoneQty(r);
        const mat = [r.mat, r.thk].filter(Boolean).join('/') || '—';
        return [
          i + 1, '', r.desc || '—', r.area || '—', r.size || '—', mat, qty || '—',
          p && qty ? `₹${(p * qty).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—',
        ];
      }),
      { imageColIndex: 1, images: stoneImages }
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

// Shorten `str` with a trailing "..." so it fits within `maxWidth` at `size`/`font`.
function truncateToWidth(str, font, size, maxWidth) {
  if (maxWidth <= 0 || font.widthOfTextAtSize(str, size) <= maxWidth) return str;
  const ell = '...';
  let lo = 0, hi = str.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(str.slice(0, mid) + ell, size) <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return lo > 0 ? str.slice(0, lo) + ell : str.slice(0, 1);
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

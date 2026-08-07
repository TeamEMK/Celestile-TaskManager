/**
 * Server-side quotation PDF generator using pdf-lib (pure ESM, no Puppeteer).
 * pdf-lib: https://pdf-lib.js.org
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { CELESTILE_LOGO, CELESTILE_MARK_RED } from './celestile-logo';

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

// A slab-priced ("100 SFT") fixing row bills in whole 100-SFT blocks: up to
// 100 SFT = 1x the rate, 101-200 SFT = 2x, etc. — rate x ceil(SFT/100).
// Mirrors fixAmount() in app/quotation/HyderabadForm.jsx.
function fixAmount(r) {
  const price = parseFloat(r.price) || 0;
  const qty = parseFloat(r.qty) || 0;
  return r.slab ? price * Math.ceil(qty / 100) : price * qty;
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
  const fixSum = fixing.reduce((s, r) => s + fixAmount(r), 0);
  return { stoneSum, discPct, discAmt, netStone, designFees, totalGst, swg, fixSum, installation, packing };
}

// Kept verbatim in sync with the Terms & Conditions shown in the in-app print
// preview (buildPdfHtml in BangaloreForm.jsx / HyderabadForm.jsx) — this is the
// PDF actually delivered to clients over WhatsApp, so any edit to one must be
// mirrored in the other.
const BNG_TERMS = [
  "Payment Terms: A 60% advance is required upon order confirmation or booking. The remaining 40% to be paid before delivery.",
  "Order Policy: Once booked, products cannot be returned, exchanged, or cancelled under any circumstances.",
  "Delivery & Transportation: All products are dispatched from our local warehouse. Transportation charges will be applicable based on the delivery location.",
  "Measurement Changes: In case of changes in site measurements during the design stage, the quotation will be revised as per actuals.",
  "Site Visit Charges: Additional charges will apply for site visits outside Bengaluru.",
  "Legal Jurisdiction: Any disputes will fall under the jurisdiction of Bengaluru, Karnataka.",
  "Quotation Validity: This quotation is valid for 30 days from the date of issue.",
  "Product Issues: Any complaints or discrepancies must be reported within 24 hours of delivery, in case installation is not in Celes'tile scope of work.",
  "Packaging Guidelines: If installation is to be carried out by Celes'tile, product boxes must remain sealed and untouched until our team arrives.",
  "Additional Charges: Charges for transportation, loading, unloading, and installation are not included in the quotation and will be billed separately.",
  "Installation Advisory: Celes'tile shall not be liable for damages caused by third-party installers or contractors not appointed by us.",
  "Installation Condition: The stone can be installed only on a cement-plastered wall.",
  "Transit Tolerance: A standard transit damage margin of 5–7% is considered acceptable within industry norms.",
  "Delivery Schedule: The delivery of the material will be processed within 48 hours upon receipt of payment.",
  "Design Iteration: Up to three changes in any drawing can be made without any additional fee.",
  "Design Confirmation: Once the drawings are approved for production, no further changes can be made.",
  "Site Condition: The stone can only be installed on a cement plastered wall, chipping is not in the scope of Celes'tile.",
  "Work Responsibility: Carpentry, Plumbing, Electrical, Fabrication, Scaffolding is not in scope of Celes'tile.",
  "Delivery Timeline: The estimated delivery timeline is 40 to 60 days from the date of order confirmation.",
  "Site Cleaning: Cleaning of debris and wooden boxes from the site is not included in the scope of Celes'tile.",
  "Storage Responsibility: If delivery is completed but installation is delayed due to site unavailability, the client shall be responsible for safe storage.",
  "Studio Timings: Monday–Saturday 9:30 am–7:30 pm, studio is closed on Sundays.",
];

// Bangalore-only static content (mirrors the in-app document in
// BangaloreForm.jsx) — bank details / payment terms / stone characteristics
// are boutique-wide, not per-quotation, so they're hardcoded here exactly
// like they are in the on-screen form rather than read off `q`.
const BNG_BANK = [
  ['Name', 'Vijayaananth Realtech'],
  ['Account No.', '50200093326161'],
  ['Bank', 'HDFC Bank'],
  ['IFSC Code', 'HDFC0001755'],
];
const BNG_PAYMENT_TERMS = [
  ['60%', 'Advance to process the order'],
  ['35%', 'Balance payment before delivery'],
  ['5%', 'Payment after finishing and before sealer'],
];
const BNG_STONE_CHARS = [
  ['Natural Variation', "As these are natural stones, variations in colour, grain pattern, porosity, and thickness of approximately 15-20% are inherent and to be expected. These natural characteristics make each piece unique."],
  ['Cleaning Instructions', 'Please avoid using acidic or alkaline substances to clean the stone surfaces, as they may react with the stone and cause permanent patches or discoloration.'],
  ['Natural Features', 'Due to the natural structure of the stone, grains and pores may open up during production, transit, or installation. Our experienced craftsmen will address and finish these areas.'],
  ['Chemical Treatment Disclaimer', "The high-grade surface treatments and chemicals used are synthetic and may age differently over time. This may cause the stone's appearance to evolve naturally with use."],
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
  let redMarkImg = null;
  try {
    redMarkImg = await doc.embedJpg(b64ToBytes(CELESTILE_MARK_RED.split(',')[1]));
  } catch { redMarkImg = null; }

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

  // Red seal mark sits first (white backing, since the source art has a white
  // background), then the gold lotus medallion "next to" it, then the wordmark.
  let leftX = PM;
  if (redMarkImg) {
    const redSize = 34, redPad = 5, redY = hMid - redSize / 2;
    pg.drawRectangle({ x: leftX, y: redY, width: redSize, height: redSize, color: WHITE, borderColor: GOLD, borderWidth: 0.75 });
    const rs = (redSize - redPad * 2) / Math.max(redMarkImg.width, redMarkImg.height);
    const rw = redMarkImg.width * rs, rh = redMarkImg.height * rs;
    pg.drawImage(redMarkImg, { x: leftX + (redSize - rw) / 2, y: redY + (redSize - rh) / 2, width: rw, height: rh });
    leftX += redSize + 12;
  }

  const logoR = 24;
  if (logoImg) {
    const s = (logoR * 1.9) / Math.max(logoImg.width, logoImg.height);
    const iw = logoImg.width * s, ih = logoImg.height * s;
    pg.drawImage(logoImg, { x: leftX + logoR - iw / 2, y: hMid - ih / 2, width: iw, height: ih });
    pg.drawCircle({ x: leftX + logoR, y: hMid, size: logoR, borderWidth: 1.2, borderColor: GOLD });
  }
  const textX = leftX + logoR * 2 + 16;
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

  // Label stacked above its value (not side-by-side) so long values wrap onto
  // extra lines instead of being clipped by a fixed-width inline slice.
  function infoBlock(title, pairs, xOrig, maxW) {
    const startYt = yt;
    pg.drawText(title, { x: xOrig, y: ay(), size: 8, font: FB, color: GOLD });
    let ly = startYt + 14;
    for (const [lbl, val] of pairs) {
      if (!val) continue;
      pg.drawText(safe(lbl).toUpperCase(), { x: xOrig, y: PH - PM - ly, size: 6.5, font: F, color: LGRAY });
      ly += 9;
      const lines = wrapText(safe(val), F, 8, maxW);
      lines.forEach((line) => {
        pg.drawText(line, { x: xOrig, y: PH - PM - ly, size: 8, font: F, color: DARK });
        ly += 10;
      });
      ly += 3;
    }
    return ly - startYt;
  }

  const rightW = CW - HALF - 20;

  const lh = infoBlock('Client Details', [
    ['Name',    q.client_name],
    ['Firm',    q.client_firm],
    ['Contact', q.client_contact],
    ['Email',   q.client_email],
    ['Site',    q.site_address],
  ], PM, HALF);

  const rh = infoBlock('Quotation Details', [
    ['Date',       fmtDate(q.quote_date)],
    ['Boutique',   q.boutique],
    ['Validity',   q.validity],
    ['Lead Time',  q.lead_time],
    ['Consultant', q.consultant],
    ['Architect',  q.architect_name || q.architect],
    ['Transport',  q.transport],
  ], PM + HALF + 20, rightW);

  yt += Math.max(lh, rh) + 12;

  // ── 3. Tables ─────────────────────────────────────────────
  const RH = 16; // row height in points

  // Cells wrap onto extra lines (row height grows to fit) instead of being
  // clipped with a trailing "..." — so long Area/Size/Material text stays
  // fully visible rather than hidden.
  const LINE_H = 9;
  const IMG_BOX = 30; // item photo thumbnail size — rows grow to fit this
  function drawTable(title, headers, colW, dataRows, opts = {}) {
    const { imageColIndex = -1, images = [] } = opts;

    const rows = dataRows.map((row, ri) => {
      let maxLines = 1;
      const cells = row.map((cell, ci) => {
        if (ci === imageColIndex) return null;
        const sz = 7.5;
        const isRight = ci >= row.length - 2;
        const isLast  = ci === row.length - 1;
        const font = isRight ? (isLast ? FB : F) : F;
        const lines = wrapText(safe(cell), font, sz, colW[ci] - 8);
        if (lines.length > maxLines) maxLines = lines.length;
        return { lines, font, sz, isRight };
      });
      const textH = maxLines * LINE_H + 7;
      const imgH = imageColIndex >= 0 && images[ri] ? IMG_BOX + 8 : 0;
      return { cells, rowH: Math.max(textH, imgH) };
    });

    const maxRowH = rows.reduce((m, r) => Math.max(m, r.rowH), RH);
    need(32 + Math.min(dataRows.length + 1, 5) * maxRowH);
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
      const { cells, rowH } = rows[ri];
      need(rowH + 2);
      if (ri % 2 === 1)
        pg.drawRectangle({ x: PM, y: ay() - rowH + 5, width: TW, height: rowH, color: ZEBRA });
      pg.drawLine({ start: { x: PM, y: ay() - rowH + 5 }, end: { x: PM + TW, y: ay() - rowH + 5 }, thickness: 0.3, color: RULE });

      let dx = PM;
      row.forEach((_cell, ci) => {
        if (ci === imageColIndex) {
          const img = images[ri];
          if (img) {
            const box = IMG_BOX;
            const scale = Math.min(box / img.width, box / img.height, 1);
            const iw = img.width * scale, ih = img.height * scale;
            pg.drawImage(img, {
              x: dx + (colW[ci] - iw) / 2,
              y: ay() - rowH + 5 + (rowH - ih) / 2,
              width: iw, height: ih,
            });
          }
          dx += colW[ci];
          return;
        }
        const { lines, font, sz, isRight } = cells[ci];
        lines.forEach((line, li) => {
          const tw = font.widthOfTextAtSize(line, sz);
          const cx = isRight ? dx + colW[ci] - tw - 6 : dx + 4;
          pg.drawText(line, { x: cx, y: ay() - LINE_H * li - 9, size: sz, font, color: DARK });
        });
        dx += colW[ci];
      });
      yt += rowH;
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
      [18, 40, 150, 52, 57, 83, 33, 90],
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
        const qty = parseFloat(r.qty) || 0;
        return [
          i + 1, r.desc || '—', r.mat || '—', r.size || '—', r.unit || '—', qty,
          `₹${fixAmount(r).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        ];
      })
    );
  }

  // ── 4. Charges / GST breakdown ─────────────────────────────
  const isHyd = branchLabel === 'Hyderabad';
  const chargeRows = [];
  if (isHyd) {
    // Display order mirrors the totals panel in HyderabadForm.jsx (client-approved
    // layout): Basic Sale Value, Design Fees, Discount, Fixing Material, Packing,
    // GST, Stone Total (Incl. GST), Installation (GST-free) — then Grand Total.
    const c = computeHyderabadCharges(stone, fixing, q);
    chargeRows.push(['Basic Sale Value (Stone)', c.stoneSum]);
    if (c.designFees > 0) chargeRows.push(['Design Fees (Concept)', c.designFees]);
    if (c.discAmt > 0) { chargeRows.push([`Discount @ ${c.discPct}%`, -c.discAmt]); chargeRows.push(['Net Stone Value', c.netStone]); }
    if (c.fixSum > 0) chargeRows.push(['Fixing Material Total', c.fixSum]);
    if (c.packing > 0) chargeRows.push(['Packing Charges', c.packing]);
    chargeRows.push(['GST (Total)', c.totalGst]);
    chargeRows.push(['Stone Total (Incl. GST)', c.swg]);
    if (c.installation > 0) chargeRows.push(['Installation Charges (No GST)', c.installation]);
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

  // ── 6. Bank details + payment terms (Bangalore only — boutique-wide, static) ──
  if (!isHyd) {
    need(20 + BNG_BANK.length * 12 + 10);
    pg.drawLine({ start: { x: PM, y: ay() }, end: { x: PW - PM, y: ay() }, thickness: 0.5, color: RULE });
    yt += 8;
    t('Bank Details', PM, 0, 8, FB, GOLD); yt += 12;
    BNG_BANK.forEach(([k, v]) => {
      need(12);
      t(k, PM + 4, 0, 7.5, F, LGRAY);
      t(v, PM + 110, 0, 7.5, FB, DARK);
      yt += 12;
    });
    yt += 6;

    need(20 + BNG_PAYMENT_TERMS.length * 12 + 10);
    t('Payment Terms', PM, 0, 8, FB, GOLD); yt += 12;
    BNG_PAYMENT_TERMS.forEach(([pct, desc]) => {
      need(12);
      t(pct, PM + 4, 0, 7.5, FB, GOLD);
      t(desc, PM + 42, 0, 7.5, F, LGRAY);
      yt += 12;
    });
    yt += 6;
  }

  // ── Payment terms (Hyderabad — single free-text field on the quotation) ──
  if (q.payment_terms) {
    need(34);
    pg.drawLine({ start: { x: PM, y: ay() }, end: { x: PW - PM, y: ay() }, thickness: 0.5, color: RULE });
    yt += 8;
    t('Payment Terms', PM, 0, 8, FB, GOLD); yt += 12;
    t(String(q.payment_terms).slice(0, 220), PM, 0, 8, F, LGRAY);
    yt += 14;
  }

  // ── 6b. Natural stone characteristics (Bangalore only) ─────
  if (!isHyd) {
    need(24);
    pg.drawLine({ start: { x: PM, y: ay() }, end: { x: PW - PM, y: ay() }, thickness: 0.5, color: RULE });
    yt += 8;
    t('Natural Stone Characteristics', PM, 0, 8, FB, GOLD); yt += 12;
    BNG_STONE_CHARS.forEach(([title, body]) => {
      const lines = wrapText(body, F, 7.5, CW - 8);
      need(11 + lines.length * 10);
      t(title, PM, 0, 7.5, FB, DARK); yt += 11;
      lines.forEach((line) => { need(10); pg.drawText(safe(line), { x: PM + 4, y: ay(), size: 7.5, font: F, color: LGRAY }); yt += 10; });
      yt += 4;
    });
    yt += 4;
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

  // ── 8. Signatures (Bangalore only) ─────────────────────────
  if (!isHyd) {
    need(40);
    yt += 14;
    const sigW = (CW - 40) / 2;
    const sigLineY = ay();
    pg.drawLine({ start: { x: PM, y: sigLineY }, end: { x: PM + sigW, y: sigLineY }, thickness: 0.6, color: RULE });
    pg.drawLine({ start: { x: PM + sigW + 40, y: sigLineY }, end: { x: PM + sigW + 40 + sigW, y: sigLineY }, thickness: 0.6, color: RULE });
    yt += 10;
    t('Agreed by Client / Signature', PM, 0, 7, F, LGRAY);
    t('For Celestile / Authorized Signatory', PM + sigW + 40, 0, 7, F, LGRAY);
    yt += 14;
  }

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

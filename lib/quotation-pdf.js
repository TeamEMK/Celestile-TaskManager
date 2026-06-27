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

const roundDim6 = (n) => Math.ceil((Number(n) || 0) / 6) * 6;
function stoneQty(r) {
  if (r.module) {
    const wt = parseFloat(r.sizeWt || String(r.size || '').split(/[x×*\s]+/i)[0]) || 0;
    const ht = parseFloat(r.sizeHt || String(r.size || '').split(/[x×*\s]+/i)[1]) || 0;
    return (roundDim6(wt) * roundDim6(ht)) / 144;
  }
  return parseFloat(r.qty) || 0;
}

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

  // ── 4. Grand total ────────────────────────────────────────
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

  // ── 5. Payment terms ──────────────────────────────────────
  if (q.payment_terms) {
    need(34);
    pg.drawLine({ start: { x: PM, y: ay() }, end: { x: PW - PM, y: ay() }, thickness: 0.5, color: RULE });
    yt += 8;
    t('Payment Terms', PM, 0, 8, FB, GOLD); yt += 12;
    t(String(q.payment_terms).slice(0, 220), PM, 0, 8, F, LGRAY);
  }

  return Buffer.from(await doc.save());
}

/**
 * Server-side EA daily-report PDF (pdf-lib, same stack as quotation-pdf.js).
 * One landscape A4 sheet laid out like the office Excel: the Walk-in table,
 * the Payments table, then the TOTAL / TILL DATE RECD TOTAL / BALANCE TARGET
 * summary lines under the Advance Paid column.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// A4 landscape
const PW = 841.89, PH = 595.28, PM = 28;
const CW = PW - 2 * PM;

const DARK  = rgb(42/255, 34/255, 24/255);
const HEAD  = rgb(36/255, 48/255, 32/255);   // dark green header bar
const WHITE = rgb(1, 1, 1);
const ZEBRA = rgb(250/255, 247/255, 242/255);
const RULE  = rgb(200/255, 192/255, 178/255);

// StandardFonts are WinAnsi-encoded — the rupee sign (U+20B9) cannot be
// drawn with them, so money is printed as "Rs." throughout.
const money = (v) => 'Rs. ' + Number(v || 0).toLocaleString('en-IN');

function fmtDate(s) {
  const m = String(s || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s || '');
}

export async function generateEaReportPdf({ dateStr, walkins, payments, sales }) {
  const doc  = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PW, PH]);
  let y = PH - PM;

  const newPageIfNeeded = (need) => {
    if (y - need < PM) { page = doc.addPage([PW, PH]); y = PH - PM; }
  };

  const fit = (text, f, size, width) => {
    let s = String(text ?? '');
    if (f.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + '...', size) > width) s = s.slice(0, -1);
    return s + '...';
  };

  // One table: header row on a dark bar, zebra body rows, thin rules.
  // cols = [{ label, w, right?, get }]
  const drawTable = (title, cols, rows) => {
    newPageIfNeeded(60);
    page.drawText(title, { x: PM, y: y - 12, size: 12, font: bold, color: DARK });
    y -= 20;

    const rowH = 16, size = 8;
    const drawHeader = () => {
      newPageIfNeeded(rowH * 2);
      page.drawRectangle({ x: PM, y: y - rowH, width: CW, height: rowH, color: HEAD });
      let x = PM;
      for (const c of cols) {
        const tx = c.right
          ? x + c.w - 4 - bold.widthOfTextAtSize(c.label, size)
          : x + 4;
        page.drawText(c.label, { x: tx, y: y - rowH + 4.5, size, font: bold, color: WHITE });
        x += c.w;
      }
      y -= rowH;
    };
    drawHeader();

    if (!rows.length) {
      page.drawRectangle({ x: PM, y: y - rowH, width: CW, height: rowH, color: ZEBRA });
      page.drawText('No entries today', { x: PM + 4, y: y - rowH + 4.5, size, font, color: DARK });
      y -= rowH;
    }
    rows.forEach((r, i) => {
      if (y - rowH < PM) { page = doc.addPage([PW, PH]); y = PH - PM; drawHeader(); }
      if (i % 2 === 0) page.drawRectangle({ x: PM, y: y - rowH, width: CW, height: rowH, color: ZEBRA });
      let x = PM;
      for (const c of cols) {
        const raw = c.get(r);
        const s = fit(raw, font, size, c.w - 8);
        const tx = c.right
          ? x + c.w - 4 - font.widthOfTextAtSize(s, size)
          : x + 4;
        page.drawText(s, { x: tx, y: y - rowH + 4.5, size, font, color: DARK });
        x += c.w;
      }
      page.drawLine({ start: { x: PM, y: y - rowH }, end: { x: PM + CW, y: y - rowH }, thickness: 0.4, color: RULE });
      y -= rowH;
    });
    y -= 8;
  };

  // Right-aligned label/value summary line (like the Excel footer rows).
  const drawSummary = (label, value, valueW) => {
    const rowH = 16, size = 9;
    newPageIfNeeded(rowH);
    const labelW = 170;
    const x0 = PM + CW - labelW - valueW;
    page.drawRectangle({ x: x0, y: y - rowH, width: labelW + valueW, height: rowH,
      borderColor: RULE, borderWidth: 0.6 });
    page.drawText(label, {
      x: x0 + labelW - 6 - bold.widthOfTextAtSize(label, size),
      y: y - rowH + 4.5, size, font: bold, color: DARK });
    page.drawText(value, {
      x: PM + CW - 6 - bold.widthOfTextAtSize(value, size),
      y: y - rowH + 4.5, size, font: bold, color: DARK });
    y -= rowH;
  };

  // Title
  page.drawText('Celestile — Daily Report', { x: PM, y: y - 16, size: 16, font: bold, color: HEAD });
  const dateLabel = fmtDate(dateStr);
  page.drawText(dateLabel, {
    x: PM + CW - font.widthOfTextAtSize(dateLabel, 11), y: y - 15, size: 11, font, color: DARK });
  y -= 30;

  drawTable('DAILY WALK-IN REPORT', [
    { label: 'DATE',           w: 58,  get: () => dateLabel },
    { label: "CLIENT'S NAME",  w: 108, get: (e) => e.client || '' },
    { label: 'PHONE NO.',      w: 72,  get: (e) => e.clientNumber || '' },
    { label: 'ARCHITECT NAME', w: 100, get: (e) => e.arcName || '' },
    { label: 'ARC. PHONE',     w: 72,  get: (e) => e.arcPhone || '' },
    { label: 'OLD/NEW',        w: 58,  get: (e) => (e.oldNewClient || '').replace(' Client', '') },
    { label: 'VISITS',         w: 40,  get: (e) => String(e.noOfVisits ?? '') },
    { label: 'REQUIREMENT',    w: 118, get: (e) => e.description || '' },
    { label: 'REMARKS',        w: 100, get: (e) => e.remarks || '' },
    { label: 'EXECUTIVE',      w: 60,  get: (e) => e.executive || '' },
  ], walkins || []);

  const payCols = [
    { label: 'DATE',            w: 58,  get: () => dateLabel },
    { label: "CLIENT'S NAME",   w: 120, get: (e) => e.client || '' },
    { label: 'ARCHITECT NAME',  w: 100, get: (e) => e.arcName || '' },
    { label: 'REQUIREMENTS',    w: 128, get: (e) => e.description || '' },
    { label: 'ORDER VALUE',     w: 80,  right: true, get: (e) => money(e.orderValue) },
    { label: 'ADVANCE PAID',    w: 80,  right: true, get: (e) => money(e.advPaid) },
    { label: 'BALANCE',         w: 80,  right: true, get: (e) => money(e.balance) },
    { label: 'MODE OF PAY',     w: 80,  get: (e) => e.modeOfPay || '' },
    { label: 'EXECUTIVE',       w: 60,  get: (e) => e.executive || '' },
  ];
  drawTable('SALES REPORT — PAYMENTS', payCols, payments || []);

  const todayTotal = (payments || []).reduce((s, e) => s + (Number(e.advPaid) || 0), 0);
  const valueW = 110;
  drawSummary('TOTAL', money(todayTotal), valueW);
  if (sales) {
    drawSummary('TILL DATE RECD TOTAL', money(sales.received), valueW);
    drawSummary('BALANCE TARGET',
      sales.target > 0 ? money(sales.target - sales.received) : 'Target not set', valueW);
  }

  return Buffer.from(await doc.save());
}

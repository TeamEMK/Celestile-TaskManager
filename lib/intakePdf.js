/**
 * "Fill form pe PDF jayega" (28-10-2026 review): when an FMS intake form is
 * submitted, a one-page PDF of what was filled goes to a WhatsApp group —
 * for Factory O2D, the "Program required at factory" group, so the factory
 * sees each new order the moment it is booked.
 *
 * Maytapi fetches a document by URL, so the submitted values are kept in
 * app_config under `intake_pdf:<id>` and served by /api/fms-intake-pdf, the
 * link carrying an HMAC signature instead of a login (same pattern as the EA
 * report PDF).
 */
import crypto from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { pool, ensureSchema } from './db.js';
import { newId } from './ids.js';
import { getAlertGroups } from './qcAlerts.js';
import { sendWhatsAppDocument, isWhatsappConfigured } from './whatsapp.js';

// Which FMS sends its form to which alert group (a name on FMS → QC Alerts →
// WhatsApp Groups, so the ID can be changed there).
const ROUTES = [
  { match: /factory\s*o2d/i, group: 'Program Required Factory' },
];

export function intakePdfGroupFor(sheet) {
  const name = String(sheet?.fms_name || sheet?.sheet_name || '');
  return ROUTES.find((r) => r.match.test(name))?.group || '';
}

export function intakePdfSig(id) {
  const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET || 'intake-pdf';
  return crypto.createHmac('sha256', secret).update(`intake-pdf:${id}`).digest('hex').slice(0, 32);
}

const KEY = (id) => `intake_pdf:${id}`;

// Uploaded files arrive as data: URLs — a PDF line wants a word, not a blob.
const shown = (v) => {
  const s = Array.isArray(v) ? v.join(', ') : String(v ?? '').trim();
  return s.startsWith('data:') ? '(file attached)' : s;
};

/**
 * Send the PDF of one submitted intake form, if this FMS has a group for it.
 * Best-effort: the row is already in the sheet. Returns what happened.
 */
export async function sendIntakePdf({ sheet, fields, values, submittedBy = '' }) {
  const groupName = intakePdfGroupFor(sheet);
  if (!groupName) return { skipped: 'no group for this FMS' };
  if (!isWhatsappConfigured()) return { skipped: 'WhatsApp not configured' };
  const jid = (await getAlertGroups())[groupName];
  if (!jid) return { skipped: `group "${groupName}" has no ID` };

  const rows = (fields || [])
    .map((f) => [String(f.field_label || f.col_letter || '').trim(), shown(values?.[f.col_letter])])
    .filter(([, v]) => v);
  const orderRow = rows.find(([l]) => /order\s*(no|number|#)/i.test(l));
  const rec = {
    fmsName: sheet.intake_form_name || sheet.fms_name || 'New entry',
    submittedBy, at: new Date().toISOString(), orderNo: orderRow?.[1] || '', rows,
  };

  await ensureSchema();
  const id = newId('IPDF');
  const value = JSON.stringify(rec);
  await pool.query(
    'INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [KEY(id), value, value]);

  const baseUrl = process.env.NEXTAUTH_URL || 'https://celestileoffice.com';
  const url = `${baseUrl}/api/fms-intake-pdf?id=${id}&sig=${intakePdfSig(id)}`;
  const file = `${(rec.orderNo || 'Order').replace(/[^\w-]+/g, '_')}-form.pdf`;
  const r = await sendWhatsAppDocument(jid, url, file, `📝 New entry — ${rec.fmsName}${rec.orderNo ? ` · ${rec.orderNo}` : ''}`);
  return { group: groupName, ok: !!r.ok };
}

export async function readIntakePdfRecord(id) {
  await ensureSchema();
  const [rows] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [KEY(id)]);
  try { return JSON.parse(rows?.[0]?.value || 'null'); } catch { return null; }
}

/* ── the PDF ───────────────────────────────────────────────────────────── */

const PW = 595.28, PH = 841.89, PM = 36;
const DARK = rgb(42 / 255, 34 / 255, 24 / 255);
const HEAD = rgb(36 / 255, 48 / 255, 32 / 255);
const MUTED = rgb(110 / 255, 100 / 255, 88 / 255);
const ZEBRA = rgb(250 / 255, 247 / 255, 242 / 255);

// StandardFonts are WinAnsi-only; anything else (Hindi, emoji) would throw.
const winAnsi = (s) => String(s ?? '').replace(/[^\x20-\x7E -ÿ]/g, '?');

function wrap(text, font, size, width) {
  const out = [];
  for (const para of winAnsi(text).split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
      if (line) out.push(line);
      // A single word wider than the column (a long link) is hard-cut.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
        out.push(w.slice(0, cut)); w = w.slice(cut);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

export async function generateIntakePdf(rec) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([PW, PH]);
  let y = PH - PM;

  page.drawRectangle({ x: PM, y: y - 34, width: PW - 2 * PM, height: 34, color: HEAD });
  page.drawText(winAnsi(rec.fmsName), { x: PM + 10, y: y - 22, size: 14, font: bold, color: rgb(1, 1, 1) });
  y -= 50;
  const when = new Date(rec.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  page.drawText(winAnsi(`Submitted ${when}${rec.submittedBy ? ` by ${rec.submittedBy}` : ''}`), { x: PM, y, size: 9, font, color: MUTED });
  y -= 18;

  const LW = 170, VW = PW - 2 * PM - LW - 20, SIZE = 10, LH = 13;
  rec.rows.forEach(([label, value], i) => {
    const ll = wrap(label, bold, SIZE, LW);
    const vl = wrap(value, font, SIZE, VW);
    const h = Math.max(ll.length, vl.length) * LH + 8;
    if (y - h < PM) { page = doc.addPage([PW, PH]); y = PH - PM; }
    if (i % 2 === 0) page.drawRectangle({ x: PM, y: y - h, width: PW - 2 * PM, height: h, color: ZEBRA });
    ll.forEach((t, k) => page.drawText(t, { x: PM + 6, y: y - 14 - k * LH, size: SIZE, font: bold, color: DARK }));
    vl.forEach((t, k) => page.drawText(t, { x: PM + LW + 14, y: y - 14 - k * LH, size: SIZE, font, color: DARK }));
    y -= h;
  });

  return doc.save();
}

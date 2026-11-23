import crypto from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { pool, ensureSchema } from '@/lib/db';
import { fetchRange } from '@/lib/fmsSheet';
import { sendWhatsAppDocument, isWhatsappConfigured } from '@/lib/whatsapp';

/**
 * Dispatch report — the "HYDERABAD DISPATCH DETAILS <month>" Excel the factory
 * kept by hand (Hyd Dispatch Dec To OCT.xlsx), built from the NEW Factory
 * O2D-ERP FMS instead and sent to Vivek sir on WhatsApp as a PDF: weekly
 * (Monday, the week before) and monthly (1st, the month before). Asked
 * 23-11-2026.
 *
 * One line per FMS row dispatched in the period:
 *   Order received = Timestamp (B), Completion = Step7 Production Out actual,
 *   Dispatch = Step10 Dispatch actual, SFT = G; the two day counts are the
 *   Excel's "completion to order received" and "completion to dispatch".
 * The step columns are found from the sheet's own step titles (row 2) and
 * "Actual" headings (row 6), so a column moved in the sheet is followed.
 *
 * Env: DISPATCH_REPORT_NOTIFY (number / group JID; else the user named Vivek),
 * DISPATCH_REPORT_BRANCHES (default "Hyderabad"; "Hyderabad,Bangalore" for both).
 */

const SHEET_ID = '1-WAv9-TD7pPDiNEHMVERUM2Rn1zvoM8eBEes7lV6rOE';
const TAB = 'Factory_Order_FMS';
const BRANCH_PREFIX = { Hyderabad: 'H', Bangalore: 'B' };
// Nothing before this goes out: the Dispatch step was back-filled in bulk in
// early November, so earlier "dispatch dates" are the day someone caught up.
const FIRST_WEEK = '2026-11-23';
const FIRST_MONTH = '2026-11';

const DAY = 86400000;
const colOf = (i) => { let n = i + 1, s = ''; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// "23/11/2026 15:34:00" → { day: 'YYYY-MM-DD', ms } (IST day), or null.
function sheetDay(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return { day: iso, ms: Date.parse(`${iso}T00:00:00Z`) };
}
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export function istToday() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// Last full Mon–Sun week before `today`, and the month before it.
export function lastWeek(today = istToday()) {
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const from = addDays(today, -dow - 7);
  return { from, to: addDays(from, 6) };
}
export function lastMonth(today = istToday()) {
  const [y, m] = today.split('-').map(Number);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const from = `${py}-${String(pm).padStart(2, '0')}-01`;
  const to = addDays(`${y}-${String(m).padStart(2, '0')}-01`, -1);
  return { from, to, month: from.slice(0, 7) };
}

export function dispatchReportSig(branch, from, to) {
  const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET || 'dispatch-report';
  return crypto.createHmac('sha256', secret).update(`dispatch:${branch}:${from}:${to}`).digest('hex').slice(0, 32);
}

export function reportBranches() {
  const list = String(process.env.DISPATCH_REPORT_BRANCHES || 'Hyderabad').split(',').map((s) => s.trim()).filter((b) => BRANCH_PREFIX[b]);
  return list.length ? list : ['Hyderabad'];
}

// The step's "Actual" column: the first "Actual" heading at or right of
// where its title sits in row 2.
function actualColFor(titles, heads, re) {
  const start = titles.findIndex((t) => re.test(String(t || '').trim()));
  if (start < 0) return -1;
  for (let i = start; i < Math.min(heads.length, start + 8); i++) {
    if (/^actual$/i.test(String(heads[i] || '').trim())) return i;
  }
  return -1;
}

export async function loadDispatchRows({ branch = 'Hyderabad', from, to }) {
  const top = await fetchRange(SHEET_ID, `'${TAB}'!A1:CZ6`);
  const titles = top[1] || [], heads = top[5] || [];
  const hi = (re) => heads.findIndex((h) => re.test(String(h || '').trim()));
  const c = {
    received: hi(/^timestamp$/i), order: hi(/^order\s*no/i), client: hi(/^client\s*name/i),
    area: hi(/^area/i), sft: hi(/^sft$/i),
    completion: actualColFor(titles, heads, /^step\s*7\s*-?\s*production\s*out/i),
    dispatch: actualColFor(titles, heads, /^step\s*10\s*-?\s*dispatch/i),
  };
  const missing = Object.entries(c).filter(([, v]) => v < 0).map(([k]) => k);
  if (missing.length) throw new Error(`Factory O2D sheet: column not found for ${missing.join(', ')}`);

  const data = await fetchRange(SHEET_ID, `'${TAB}'!A7:${colOf(Math.max(...Object.values(c)))}`);
  const prefix = BRANCH_PREFIX[branch] || 'H';
  const rows = [];
  for (const r of data) {
    const order = String(r[c.order] ?? '').trim();
    if (!order || order[0].toUpperCase() !== prefix) continue;
    const disp = sheetDay(r[c.dispatch]);
    if (!disp || disp.day < from || disp.day > to) continue;
    const rec = sheetDay(r[c.received]), comp = sheetDay(r[c.completion]);
    rows.push({
      received: rec?.day || '', order, client: String(r[c.client] ?? '').trim(), area: String(r[c.area] ?? '').trim(),
      completion: comp?.day || '', dispatch: disp.day, sft: parseFloat(r[c.sft]) || 0,
      toCompletion: rec && comp ? Math.round((comp.ms - rec.ms) / DAY) : null,
      toDispatch: comp ? Math.round((disp.ms - comp.ms) / DAY) : null,
    });
  }
  rows.sort((a, b) => a.dispatch.localeCompare(b.dispatch) || a.order.localeCompare(b.order));
  return rows;
}

export function summarize(rows) {
  const avg = (k) => { const v = rows.map((r) => r[k]).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  return {
    count: rows.length,
    orders: new Set(rows.map((r) => r.order)).size,
    sft: Math.round(rows.reduce((a, r) => a + r.sft, 0) * 100) / 100,
    avgToCompletion: avg('toCompletion'),
    avgToDispatch: avg('toDispatch'),
    waitedOver7: rows.filter((r) => r.toDispatch != null && r.toDispatch > 7).length,
  };
}

export function periodLabel(from, to) {
  const monthEnd = addDays(`${addDays(`${from.slice(0, 7)}-01`, 32).slice(0, 7)}-01`, -1);
  if (from.endsWith('-01') && to === monthEnd) {
    const name = new Date(`${from}T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toUpperCase();
    return `${name} - ${from.slice(0, 4)}`;
  }
  return `${dmy(from)} TO ${dmy(to)}`;
}

/* ── PDF ───────────────────────────────────────────────────────── */

const PW = 841.89, PH = 595.28, PM = 24, CW = PW - 2 * PM;
const DARK = rgb(42 / 255, 34 / 255, 24 / 255);
const HEAD = rgb(36 / 255, 48 / 255, 32 / 255);
const WHITE = rgb(1, 1, 1);
const ZEBRA = rgb(250 / 255, 247 / 255, 242 / 255);
const RULE = rgb(200 / 255, 192 / 255, 178 / 255);
const RED = rgb(185 / 255, 28 / 255, 28 / 255);

export async function generateDispatchReportPdf({ branch, from, to, rows }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ascii = (s) => String(s ?? '').replace(/[^\x20-\x7E]/g, ' ');
  const fit = (text, f, size, width) => {
    let s = ascii(text);
    if (f.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + '...', size) > width) s = s.slice(0, -1);
    return s + '...';
  };

  const cols = [
    { label: 'S.NO', w: 30, get: (r, i) => String(i + 1) },
    { label: 'ORDER RECEIVED', w: 66, get: (r) => dmy(r.received) },
    { label: 'ORDER CODE', w: 58, get: (r) => r.order },
    { label: 'CLIENT NAME', w: 140, get: (r) => r.client },
    { label: 'AREA', w: 0, get: (r) => r.area },
    { label: 'COMPLETION', w: 64, get: (r) => dmy(r.completion) },
    { label: 'DISPATCH', w: 64, get: (r) => dmy(r.dispatch) },
    { label: 'SFT', w: 48, right: true, get: (r) => (r.sft ? String(r.sft) : '') },
    { label: 'RECEIVED > COMPL.', w: 78, right: true, get: (r) => (r.toCompletion == null ? '-' : `${r.toCompletion}`) },
    { label: 'COMPL. > DISPATCH', w: 78, right: true, get: (r) => (r.toDispatch == null ? '-' : `${r.toDispatch}`), warn: (r) => r.toDispatch > 7 },
  ];
  cols[4].w = CW - cols.reduce((a, x) => a + x.w, 0);

  let page = doc.addPage([PW, PH]);
  let y = PH - PM;
  const title = `${branch.toUpperCase()} DISPATCH DETAILS ${periodLabel(from, to)}`;
  page.drawText(title, { x: PM, y: y - 14, size: 14, font: bold, color: DARK });
  y -= 22;
  page.drawText(`From the NEW Factory O2D-ERP FMS - dispatches dated ${dmy(from)} to ${dmy(to)}. Days = calendar days.`, { x: PM, y: y - 9, size: 8, font, color: DARK });
  y -= 18;

  const rowH = 15, size = 7.5;
  const header = () => {
    page.drawRectangle({ x: PM, y: y - rowH, width: CW, height: rowH, color: HEAD });
    let x = PM;
    for (const cl of cols) {
      const t = fit(cl.label, bold, size, cl.w - 6);
      const tx = cl.right ? x + cl.w - 3 - bold.widthOfTextAtSize(t, size) : x + 3;
      page.drawText(t, { x: tx, y: y - rowH + 4.5, size, font: bold, color: WHITE });
      x += cl.w;
    }
    y -= rowH;
  };
  header();
  rows.forEach((r, i) => {
    if (y - rowH < PM + 40) { page = doc.addPage([PW, PH]); y = PH - PM; header(); }
    if (i % 2) page.drawRectangle({ x: PM, y: y - rowH, width: CW, height: rowH, color: ZEBRA });
    let x = PM;
    for (const cl of cols) {
      const t = fit(cl.get(r, i), font, size, cl.w - 6);
      const tx = cl.right ? x + cl.w - 3 - font.widthOfTextAtSize(t, size) : x + 3;
      page.drawText(t, { x: tx, y: y - rowH + 4.5, size, font: cl.warn?.(r) ? bold : font, color: cl.warn?.(r) ? RED : DARK });
      x += cl.w;
    }
    page.drawLine({ start: { x: PM, y: y - rowH }, end: { x: PM + CW, y: y - rowH }, thickness: 0.4, color: RULE });
    y -= rowH;
  });
  if (!rows.length) {
    page.drawText('No dispatch was marked in the FMS for this period.', { x: PM + 3, y: y - rowH + 4.5, size: 9, font, color: DARK });
    y -= rowH;
  }

  const s = summarize(rows);
  if (y - 70 < PM) { page = doc.addPage([PW, PH]); y = PH - PM; }
  y -= 8;
  const line = (label, value) => {
    page.drawText(label, { x: PM, y: y - 10, size: 9, font: bold, color: DARK });
    page.drawText(String(value), { x: PM + 230, y: y - 10, size: 9, font, color: DARK });
    y -= 14;
  };
  line('TOTAL SFT', s.sft);
  line('Entries dispatched / orders', `${s.count} / ${s.orders}`);
  line('Avg days: order received > completion', s.avgToCompletion ?? '-');
  line('Avg days: completion > dispatch', s.avgToDispatch ?? '-');
  line('Waited more than 7 days after completion', s.waitedOver7);

  return Buffer.from(await doc.save());
}

/* ── sending ───────────────────────────────────────────────────── */

async function recipient() {
  if (process.env.DISPATCH_REPORT_NOTIFY) return process.env.DISPATCH_REPORT_NOTIFY;
  await ensureSchema();
  const [users] = await pool.query('SELECT name, phone, active FROM users');
  const v = (users || []).filter((u) => /\bvivek\b/i.test(String(u.name || '')) && u.phone && String(u.active ?? '1') !== '0');
  return v.length === 1 ? v[0].phone : '';
}

async function readKey(key) {
  const [rows] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [key]);
  return String(rows?.[0]?.value || '');
}
async function writeKey(key, value) {
  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?', [key, value, value]);
}

// One period, every configured branch: a PDF each plus a one-line summary.
export async function sendDispatchReport({ from, to, kind = 'Weekly', to_number = null }) {
  if (!isWhatsappConfigured()) return { ok: false, error: 'WhatsApp not configured' };
  const to_ = to_number || await recipient();
  if (!to_) return { ok: false, error: 'No recipient — set DISPATCH_REPORT_NOTIFY (no single active user named Vivek with a phone)' };
  const base = process.env.NEXTAUTH_URL || 'https://celestileoffice.com';
  const out = [];
  for (const branch of reportBranches()) {
    const rows = await loadDispatchRows({ branch, from, to });
    const s = summarize(rows);
    const url = `${base}/api/dispatch-report-pdf?branch=${branch}&from=${from}&to=${to}&sig=${dispatchReportSig(branch, from, to)}`;
    const caption = [
      `*${kind} Dispatch Report — ${branch}*`,
      `${dmy(from)} to ${dmy(to)}`,
      `Dispatched: ${s.count} entries (${s.orders} orders) · ${s.sft} SFT`,
      `Avg order → completion: ${s.avgToCompletion ?? '-'} days`,
      `Avg completion → dispatch: ${s.avgToDispatch ?? '-'} days`,
    ].join('\n');
    const d = await sendWhatsAppDocument(to_, url, `${branch}-Dispatch-${from}-to-${to}.pdf`, caption);
    out.push({ branch, entries: s.count, ok: !!d.ok, ...(d.reason || d.error ? { reason: d.reason || d.error } : {}) });
  }
  return { ok: out.every((x) => x.ok), kind, from, to, branches: out };
}

const WEEK_KEY = 'dispatch_report_week_sent';
const MONTH_KEY = 'dispatch_report_month_sent';

// Anything due and not yet sent: last week's report from Monday on, last
// month's from the 1st on (a missed day is caught up the next one).
export async function dispatchReportsDue(today = istToday()) {
  await ensureSchema();
  const w = lastWeek(today), m = lastMonth(today);
  return {
    week: w.from >= FIRST_WEEK && (await readKey(WEEK_KEY)) !== w.from ? w : null,
    month: m.month >= FIRST_MONTH && (await readKey(MONTH_KEY)) !== m.month ? m : null,
  };
}

export async function sendDueDispatchReports() {
  const due = await dispatchReportsDue();
  const res = {};
  if (due.week) {
    res.week = await sendDispatchReport({ ...due.week, kind: 'Weekly' });
    if (res.week.ok) await writeKey(WEEK_KEY, due.week.from);
  }
  if (due.month) {
    res.month = await sendDispatchReport({ from: due.month.from, to: due.month.to, kind: 'Monthly' });
    if (res.month.ok) await writeKey(MONTH_KEY, due.month.month);
  }
  return res;
}

/**
 * Enquiry FMS → the sales person's own WhatsApp (17-11-2026: "Getting touch,
 * meeting and follow up sales person ko msg jana chahiye whatsapp pe").
 *
 *  - A lead assigned (Assign Sales Person done) → that sales person gets the
 *    lead's details straight away.
 *  - Every morning (lib/scheduler.js, ENQUIRY_DIGEST_TIME, default 09:30) →
 *    each sales person gets their Enquiry tasks due by tonight: get in touch,
 *    follow ups, today's meetings — one message per person.
 *
 * The lead's sales person is the "Sales Person Name" column; their number is
 * the phone on their user profile. Best-effort throughout: nothing here may
 * fail a save.
 */
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, isWhatsappConfigured } from '@/lib/whatsapp';
import { getFullSteps, fetchRange, extractSpreadsheetId } from '@/lib/fmsSheet';
import { istDateStr } from '@/lib/dailyReport';
import { SHEET_ID, TAB } from '@/lib/enquiryStepsMigrate';

const SENT_KEY = 'enquiry_sales_digest_sent';
const isEnquiry = (sheet) => extractSpreadsheetId(sheet?.sheet_id) === SHEET_ID && String(sheet?.sheet_name || '').trim() === TAB;
const norm = (s) => String(s ?? '').trim().toLowerCase();

async function phoneOf(name) {
  const [users] = await pool.query('SELECT name, phone, active FROM users');
  const u = users.find((x) => norm(x.name) === norm(name) && String(x.active ?? '1') !== '0');
  return u?.phone || '';
}

// The lead's own columns by header: Lead ID, Full Name, Phone, Area, City…
function leadOf(headers, row) {
  const at = (re) => { const i = headers.findIndex((h) => re.test(String(h || '').trim())); return i >= 0 ? String(row[i] ?? '').trim() : ''; };
  return {
    id: at(/^lead\s*(id|no)/i), name: at(/^full\s*name$/i), phone: at(/^phone$/i),
    area: at(/^area\b/i), city: at(/^city$/i), source: at(/^source/i), type: at(/^type$/i),
    project: at(/^project\s*type/i), salesPerson: at(/^sales\s*person/i),
  };
}

const leadLine = (l) => [l.name, l.phone, [l.area, l.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ');

/** Assign Sales Person just done on an Enquiry row → tell that sales person. */
export async function notifyEnquiryAssigned({ sheet, step, rowNumber }) {
  if (!isEnquiry(sheet) || !/assign\s*sales/i.test(String(step?.step_name || '')) || !isWhatsappConfigured()) return;
  const hr = parseInt(sheet.header_row) || 1;
  const [[headers = []], [row = []]] = await Promise.all([
    fetchRange(sheet.sheet_id, `${sheet.sheet_name}!${hr}:${hr}`),
    fetchRange(sheet.sheet_id, `${sheet.sheet_name}!${rowNumber}:${rowNumber}`),
  ]);
  const l = leadOf(headers, row);
  if (!l.salesPerson) return;
  const phone = await phoneOf(l.salesPerson);
  if (!phone) { console.error(`[enquiry alerts] no phone for "${l.salesPerson}"`); return; }
  const msg = [
    `🆕 *New enquiry assigned to you*${l.id ? ` — ${l.id}` : ''}`, '',
    `👤 ${l.name || '—'}`,
    l.phone ? `📞 ${l.phone}` : null,
    (l.area || l.city) ? `📍 ${[l.area, l.city].filter(Boolean).join(', ')}` : null,
    l.type ? `Type: ${l.type}` : null,
    l.project ? `Project: ${l.project}` : null,
    l.source ? `Source: ${l.source}` : null,
    '', 'Please get in touch with the client and schedule the meeting.',
  ].filter((x) => x !== null).join('\n');
  await sendWhatsApp(phone, msg);
}

// "17/11/2026 19:00:00" (IST) → ms; null if not a date.
function planMs(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) - 5.5 * 3600 * 1000;
}

// What each step asks of the sales person, in the morning message.
function stepLabel(name) {
  const n = String(name || '');
  if (/getting\s*touch/i.test(n)) return '📞 Get in touch & fix the meeting';
  if (/update\s*meeting/i.test(n)) return '🤝 Meeting today — update its status';
  if (/follow\s*up\s*for\s*meeting/i.test(n)) return '📅 Follow up for the meeting date';
  if (/follow\s*up\s*for\s*advance/i.test(n)) return '💰 Follow up for advance';
  if (/share\s*quotation/i.test(n)) return '📄 Share the quotation';
  if (/follow/i.test(n)) return '🔁 Follow up';
  return n.trim();
}

/** The morning list: each sales person's Enquiry tasks due by tonight. */
export async function sendEnquirySalesDigest() {
  if (!isWhatsappConfigured()) return { skipped: 'WhatsApp not configured' };
  await ensureSchema();
  const [sheets] = await pool.query('SELECT * FROM fms_sheets');
  const sheet = sheets.find(isEnquiry);
  if (!sheet) return { skipped: 'no Enquiry FMS' };

  const steps = (await getFullSteps(sheet.id)).filter((s) => s.plan_col && s.actual_col && !/assign\s*sales/i.test(s.step_name));
  const rows = await fetchRange(sheet.sheet_id, `${sheet.sheet_name}!A:BZ`);
  const hr = (parseInt(sheet.header_row) || 1) - 1;
  const headers = rows[hr] || [];
  const col = (c) => [...String(c).toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const endOfToday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 23, 59) - 5.5 * 3600 * 1000;

  const byPerson = new Map();
  for (const row of rows.slice(hr + 1)) {
    const l = leadOf(headers, row);
    if (!l.salesPerson || !l.name) continue;
    for (const s of steps) {
      const plan = String(row[col(s.plan_col)] ?? '').trim();
      if (!plan || String(row[col(s.actual_col)] ?? '').trim()) continue;
      const due = planMs(plan);
      if (due == null || due > endOfToday) continue;
      const key = norm(l.salesPerson);
      if (!byPerson.has(key)) byPerson.set(key, { name: l.salesPerson, items: [] });
      byPerson.get(key).items.push({ label: stepLabel(s.step_name), lead: l, late: due < Date.now() - 24 * 3600 * 1000 });
    }
  }

  const results = [];
  for (const { name, items } of byPerson.values()) {
    const phone = await phoneOf(name);
    if (!phone) { results.push({ name, ok: false, reason: 'no phone' }); continue; }
    const groups = new Map();
    for (const it of items) (groups.get(it.label) || groups.set(it.label, []).get(it.label)).push(it);
    const lines = [`☀️ *Good morning ${name}* — your enquiries for today (${items.length})`];
    for (const [label, list] of groups) {
      lines.push('', `*${label}*`);
      for (const it of list) lines.push(`• ${it.lead.id ? `${it.lead.id} — ` : ''}${leadLine(it.lead)}${it.late ? ' ⚠️ pending' : ''}`);
    }
    const r = await sendWhatsApp(phone, lines.join('\n'));
    results.push({ name, items: items.length, ok: !!r.ok, reason: r.reason || r.error });
  }
  return { people: results.length, results };
}

export async function enquiryDigestSentToday() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [SENT_KEY]);
  return String(rows?.[0]?.value || '') === istDateStr();
}

export async function markEnquiryDigestSent() {
  const today = istDateStr();
  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?', [SENT_KEY, today, today]);
}

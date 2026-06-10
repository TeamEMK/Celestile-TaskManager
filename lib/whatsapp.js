/**
 * WhatsApp notifications via Maytapi (https://maytapi.com).
 *
 * Needs three env vars (from the Maytapi dashboard after connecting a number):
 *   MAYTAPI_PRODUCT_ID, MAYTAPI_PHONE_ID, MAYTAPI_TOKEN
 *
 * Sending is best-effort: failures are logged, never thrown, so they can't
 * break the request that triggered them.
 */
const PRODUCT_ID = process.env.MAYTAPI_PRODUCT_ID;
const PHONE_ID   = process.env.MAYTAPI_PHONE_ID;
const TOKEN      = process.env.MAYTAPI_TOKEN;
const DEFAULT_CC = process.env.WHATSAPP_DEFAULT_CC || '91'; // India

export function isWhatsappConfigured() {
  return !!(PRODUCT_ID && PHONE_ID && TOKEN);
}

// Normalise a phone to digits with a country code (Maytapi wants e.g. 919876543210)
export function formatNumber(raw) {
  let n = String(raw || '').replace(/\D/g, '');
  n = n.replace(/^0+/, ''); // drop leading zeros
  if (!n) return null;
  if (n.length === 10) n = DEFAULT_CC + n;          // bare local number
  return n.length >= 11 && n.length <= 15 ? n : null;
}

export async function sendWhatsApp(toPhone, message) {
  if (!isWhatsappConfigured()) return { skipped: true, reason: 'not configured' };
  const number = formatNumber(toPhone);
  if (!number) return { skipped: true, reason: 'invalid number' };
  try {
    const res = await fetch(`https://api.maytapi.com/api/${PRODUCT_ID}/${PHONE_ID}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-maytapi-key': TOKEN },
      body: JSON.stringify({ to_number: number, type: 'text', message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      console.error('[whatsapp] send failed', res.status, JSON.stringify(data));
      return { ok: false, status: res.status, data };
    }
    return { ok: true, data };
  } catch (err) {
    console.error('[whatsapp] error', err.message);
    return { ok: false, error: err.message };
  }
}

function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);            // YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;     // -> DD-MM-YYYY
}

// Build the "New Task Delegated" WhatsApp message (matches the desired format).
export function delegationMessage({ doerName, byName, dueDate, priority, approval, description }) {
  const approvalYN = approval && approval !== 'No Approval' ? 'Yes' : 'No';
  return [
    `Hello ${doerName || 'there'},`,
    '',
    '📋 *New Task Delegated*',
    '',
    `*By:* ${byName || '—'}`,
    `*Due:* ${fmtDate(dueDate)}`,
    `*Priority:* ${priority || 'Low'}`,
    `*Approval Required:* ${approvalYN}`,
    '',
    `*Task:* ${description || ''}`,
    '',
    '— Celestile-TaskManager',
  ].join('\n');
}

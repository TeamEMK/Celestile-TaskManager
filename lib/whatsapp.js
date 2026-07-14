/**
 * WhatsApp notifications via Maytapi (https://maytapi.com).
 *
 * Needs three env vars (from the Maytapi dashboard after connecting a number):
 *   MAYTAPI_PRODUCT_ID, MAYTAPI_PHONE_ID, MAYTAPI_TOKEN
 *
 * Sending is best-effort: failures are logged, never thrown, so they can't
 * break the request that triggered them.
 */

// Strip BOM / zero-width chars and surrounding whitespace — env vars set via
// some CLIs (e.g. PowerShell piping) can pick up a U+FEFF BOM that breaks the
// HTTP header it's used in.
const clean = (v) => String(v || '').replace(/[​-‍﻿]/g, '').trim();

const PRODUCT_ID = clean(process.env.MAYTAPI_PRODUCT_ID);
const PHONE_ID   = clean(process.env.MAYTAPI_PHONE_ID);
const TOKEN      = clean(process.env.MAYTAPI_TOKEN);
const DEFAULT_CC = clean(process.env.WHATSAPP_DEFAULT_CC) || '91'; // India

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

// Send a file/document by URL via Maytapi (fileUrl must be publicly reachable).
export async function sendWhatsAppDocument(toPhone, fileUrl, filename, caption) {
  if (!isWhatsappConfigured()) return { skipped: true, reason: 'not configured' };
  const number = formatNumber(toPhone);
  if (!number) {
    console.error('[whatsapp] doc skipped — invalid/empty number', JSON.stringify(toPhone));
    return { skipped: true, reason: 'invalid number' };
  }
  try {
    const res = await fetch(`https://api.maytapi.com/api/${PRODUCT_ID}/${PHONE_ID}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-maytapi-key': TOKEN },
      body: JSON.stringify({ to_number: number, type: 'media', message: fileUrl, text: caption || '', filename: filename || 'quotation.html' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      console.error('[whatsapp] doc send failed', res.status, JSON.stringify(data));
      return { ok: false, status: res.status, data };
    }
    return { ok: true, data };
  } catch (err) {
    console.error('[whatsapp] doc error', err.message);
    return { ok: false, error: err.message };
  }
}

export async function sendWhatsApp(toPhone, message) {
  if (!isWhatsappConfigured()) {
    console.error('[whatsapp] skipped — not configured (missing MAYTAPI_PRODUCT_ID/PHONE_ID/TOKEN)');
    return { skipped: true, reason: 'not configured' };
  }
  const number = formatNumber(toPhone);
  if (!number) {
    console.error('[whatsapp] skipped — invalid/empty number', JSON.stringify(toPhone));
    return { skipped: true, reason: 'invalid number' };
  }
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

function fmtDate(d, sep = '-') {
  if (!d) return '—';
  const s = String(d).slice(0, 10);            // YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}${sep}${m[2]}${sep}${m[1]}` : s;  // -> DD-MM-YYYY
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

// Build the "Task Completed" WhatsApp message sent back to whoever delegated it.
export function taskDoneMessage({ byName, doerName, description }) {
  return [
    `Hello ${byName || 'there'},`,
    '',
    '✅ *Task Completed*',
    '',
    `*By:* ${doerName || '—'}`,
    '',
    `*Task:* ${description || ''}`,
    '',
    '— Celestile-TaskManager',
  ].join('\n');
}

// Daily-task submission confirmation — sent once, on the user's first
// submission of the day (ported from the Apps Script buildWhatsAppMessage).
export function dailyTaskConfirmationMessage(name, date) {
  return [
    `✨ Hello ${name || 'there'},`,
    'Thank you for submitting your daily task ✔️',
    `Your response for the date ${fmtDate(date, '/')} has been successfully recorded 📄✨`,
  ].join('\n');
}

// Quotation-revision summary (text-only; ported from notifyRevisionUsingSnapshot).
// `changes` is the array from lib/quotation.buildChangeList().
export function quotationRevisionMessage({ branch, refNo, clientName, revisedBy, dateStr, changes, grandTotal, pdfUrl }) {
  const branchLabel = branch ? branch.charAt(0).toUpperCase() + branch.slice(1) : '—';
  let changeText = (changes && changes.length) ? changes.join('\n') : '• No field changes detected';
  if (changeText.length > 1800) changeText = changeText.substring(0, 1800) + '\n  …(truncated)';
  return [
    `*Celestile ${branchLabel} — Quotation Revised* 📝`,
    '─────────────────────────',
    `*Ref No:* ${refNo || '—'}`,
    `*Client:* ${clientName || '—'}`,
    `*Revised by:* ${revisedBy || 'Unknown user'}`,
    `*Date:* ${dateStr || ''}`,
    '',
    '*Changes:*',
    changeText,
    '',
    `*Grand Total:* ${grandTotal || '—'}`,
    ...(pdfUrl ? ['', `📄 *PDF:* ${pdfUrl}`] : []),
  ].join('\n');
}

// Quotation approval request — sent to approver (Megha/Vivek/Vinay) on new quotation.
export function quotationApprovalRequestMessage({ branch, refNo, clientName, grandTotal, createdBy, approvalUrl }) {
  const branchLabel = branch ? branch.charAt(0).toUpperCase() + branch.slice(1) : '—';
  return [
    `🆕 *New Quotation — ${branchLabel}*`,
    '─────────────────────────',
    `*Ref No:* ${refNo || '—'}`,
    `*Client:* ${clientName || '—'}`,
    `*Amount:* ₹${grandTotal || '—'}`,
    `*Created by:* ${createdBy || '—'}`,
    '',
    '📋 *Approval Required — tap to review:*',
    approvalUrl || '',
    '',
    '— Celestile-TaskManager',
  ].join('\n');
}

// Sent to the sales person when their quotation is approved.
export function quotationApprovedMessage({ refNo, clientName, approvedBy, grandTotal }) {
  return [
    `✅ *Quotation Approved!*`,
    '─────────────────────────',
    `*Ref No:* ${refNo || '—'}`,
    `*Client:* ${clientName || '—'}`,
    `*Amount:* ₹${grandTotal || '—'}`,
    `*Approved by:* ${approvedBy || '—'}`,
    '',
    'Your quotation has been approved. You can now proceed.',
    '— Celestile-TaskManager',
  ].join('\n');
}

// Sent to the sales person when their quotation is rejected.
export function quotationRejectedMessage({ refNo, clientName, rejectedBy, reason }) {
  return [
    `❌ *Quotation Rejected*`,
    '─────────────────────────',
    `*Ref No:* ${refNo || '—'}`,
    `*Client:* ${clientName || '—'}`,
    `*Rejected by:* ${rejectedBy || '—'}`,
    ...(reason ? [`*Reason:* ${reason}`] : []),
    '',
    'Please revise and resubmit.',
    '— Celestile-TaskManager',
  ].join('\n');
}

// Inventory slab block / release notifications (ported from updateEntry).
export function slabBlockedMessage(s) {
  return [
    '🟥 *SLAB BLOCKED*', '',
    `📦 Slab: ${s.slab || '-'}`,
    `🪨 Material: ${s.material || '-'} -- ${s.thickness || '-'}`,
    `📏 Size: ${s.sizeL || '-'} x ${s.sizeW || '-'}`,
    `📐 SFT: ${s.sft || '-'}`,
    `🧾 Order: ${s.orderNo || '-'}`,
  ].join('\n');
}
export function slabReleasedMessage(s) {
  return [
    '🟢 *SLAB RELEASED*', '',
    `📦 Slab: ${s.slab || '-'}`,
    `🪨 Material: ${s.material || '-'} -- ${s.thickness || '-'}`,
    `📐 SFT: ${s.sft || '-'}`,
  ].join('\n');
}

function freqAbbr(f) {
  const s = String(f || '').toLowerCase();
  if (s.startsWith('d')) return 'D';
  if (s.startsWith('w')) return 'W';
  if (s.startsWith('m')) return 'M';
  return String(f || '-').charAt(0).toUpperCase() || '-';
}

// Grouped checklist reminder — one message per user listing all their pending
// checklist tasks (matches the "Checklist Pending Task Summary" format).
export function checklistReminderMessage(name, tasks) {
  const blocks = (tasks || []).map((t) => [
    `Task ID - ${t.id || ''}`,
    `Task - ${t.task || ''}`,
    `Target Date - ${fmtDate(t.targetDate, '/')}`,
    `Client Name - ${t.client || '-'}`,
    `Frequency - ${freqAbbr(t.frequency)}`,
  ].join('\n'));
  return `*${name || 'Hello'} - Checklist Pending Task Summary*\n\n` + blocks.join('\n\n');
}

// Overdue-task reminder (one per task) — matches the desired summary format.
export function reminderMessage({ name, id, description, dueDate, priority, client }) {
  return [
    `*${name || 'Hello'} - Delegation Pending Task Summary*`,
    '',
    `Task ID - ${id || ''}`,
    `Task - ${description || ''}`,
    `Target Date - ${fmtDate(dueDate, '/')}`,
    `Priority - ${priority || 'Low'}`,
    `Client Name - ${client || '-'}`,
  ].join('\n');
}

/**
 * FMS delay alerts — a step running past its Planned time goes to that
 * step's WhatsApp group: "this client's this item is pending, running late".
 * Asked for in the 23-10-2026 review: nothing alerted when a doer missed
 * the target, so delays were only found by opening the sheet.
 *
 * Which group a step reports to is admin config (FMS → QC Alerts → Delay
 * Alerts), stored as one JSON blob in app_config keyed by step id, and names
 * the same groups the QC checklists use (lib/qcAlerts.js) — so "Stone Order
 * {branch}" routes per order there too. A step with no group sends nothing.
 *
 * One digest per group per day (lib/scheduler.js), not one message per row:
 * an FMS with 300 pending rows must not flood a group.
 */
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, isWhatsappConfigured } from '@/lib/whatsapp';
import { getAlertGroups, resolveTargets } from '@/lib/qcAlerts';
import { getOverdueRows, delayText } from '@/lib/fmsSheet';
import { istDateStr } from '@/lib/dailyReport';

const CONFIG_KEY = 'fms_delay_alert_groups';
const SENT_KEY = 'fms_delay_alert_sent';
const MAX_LINES = 40;

async function readConfig(key) {
  await ensureSchema();
  const [rows] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [key]);
  return rows?.[0]?.value ?? '';
}

async function writeConfig(key, value) {
  await pool.query(
    'INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [key, value, value]
  );
}

// { [stepId]: "SKM, Stone Order {branch}" }
export async function getDelayAlertConfig() {
  try { return JSON.parse((await readConfig(CONFIG_KEY)) || '{}') || {}; } catch { return {}; }
}

export async function saveDelayAlertConfig(map) {
  const clean = {};
  for (const [stepId, spec] of Object.entries(map || {})) {
    const s = String(spec || '').trim();
    if (stepId && s) clean[stepId] = s;
  }
  await ensureSchema();
  await writeConfig(CONFIG_KEY, JSON.stringify(clean));
  return clean;
}

function fmtPlanned(v) {
  return String(v || '').replace(/:\d{2}$/, '').trim();
}

export function delayDigest(groupName, rows) {
  const byStep = new Map();
  for (const r of rows.sort((a, b) => b.lateMs - a.lateMs)) {
    const k = `${r.fmsName} · ${r.stepName}`;
    if (!byStep.has(k)) byStep.set(k, []);
    byStep.get(k).push(r);
  }
  const lines = [`⏰ *DELAYED WORK — ${groupName}*`, `${rows.length} item${rows.length > 1 ? 's' : ''} past the target date`];
  let shown = 0;
  for (const [step, items] of byStep) {
    lines.push('', `📍 *${step}*`);
    for (const r of items) {
      if (shown >= MAX_LINES) break;
      lines.push(`• ${r.orderNo || '-'}${r.client ? ` — ${r.client}` : ''}${r.area ? ` (${r.area})` : ''} · due ${fmtPlanned(r.planned)} · *${delayText(r.lateMs)} late*${r.doer ? ` · ${r.doer}` : ''}`);
      shown++;
    }
  }
  if (rows.length > shown) lines.push('', `…and ${rows.length - shown} more — see Live Tracking.`);
  return lines.join('\n');
}

/**
 * Collect every overdue row of a configured step, route it to its groups and
 * send one digest per group. Returns { groups: [{ name, items, sent }],
 * unset: [names], overdue } so the admin's "Send now" can show what happened.
 */
export async function sendDelayAlerts() {
  const config = await getDelayAlertConfig();
  const stepIds = Object.keys(config);
  if (!stepIds.length) return { groups: [], unset: [], overdue: 0 };

  const [groups, overdue] = await Promise.all([getAlertGroups(), getOverdueRows(stepIds)]);
  const byJid = new Map();
  const unset = new Set();
  for (const r of overdue) {
    for (const t of resolveTargets(config[r.stepId], groups, { orderNo: r.orderNo })) {
      if (!t.jid) { unset.add(t.name); continue; }
      if (!byJid.has(t.jid)) byJid.set(t.jid, { name: t.name, rows: [] });
      byJid.get(t.jid).rows.push(r);
    }
  }

  const result = [];
  for (const [jid, g] of byJid) {
    let sent = false;
    if (isWhatsappConfigured()) {
      try { await sendWhatsApp(jid, delayDigest(g.name, g.rows)); sent = true; }
      catch (e) { console.error(`[delay alerts] ${g.name}:`, e.message); }
    }
    result.push({ name: g.name, items: g.rows.length, sent });
  }
  return { groups: result, unset: [...unset], overdue: overdue.length };
}

export async function delayAlertsSentToday() {
  return (await readConfig(SENT_KEY)) === istDateStr();
}

export async function markDelayAlertsSent() {
  await writeConfig(SENT_KEY, istDateStr());
}

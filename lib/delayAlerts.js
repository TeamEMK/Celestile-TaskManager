/**
 * FMS step alerts to WhatsApp groups — three per step, all asked for in the
 * 23-10-2026 review:
 *
 *   late — a step running past its Planned time: "this client's this item is
 *          pending, running late". Nothing alerted before, so delays were
 *          only found by opening the sheet.
 *   list — every item still pending at that step, daily, with how long it
 *          has waited (⚠️ past 7 days). For Dispatch: what is packed and
 *          ready but not yet sent, to the Stone Order group of its branch.
 *   done — the moment a row is marked done, its order details to the group
 *          ("Packing done — material ready").
 *
 * Which group each goes to is admin config (FMS → QC Alerts → Step Alerts),
 * stored as one JSON blob in app_config keyed by step id, naming the same
 * groups the QC checklists use (lib/qcAlerts.js) — so "Stone Order {branch}"
 * routes per order. A step with nothing set sends nothing.
 *
 * late + list go out as one digest per group per day (lib/scheduler.js), not
 * one message per row: an FMS with 300 pending rows must not flood a group.
 */
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, isWhatsappConfigured } from '@/lib/whatsapp';
import { getAlertGroups, resolveTargets } from '@/lib/qcAlerts';
import { getOverdueRows, delayText, rowDetails } from '@/lib/fmsSheet';
import { istDateStr } from '@/lib/dailyReport';

const CONFIG_KEY = 'fms_delay_alert_groups';
const SENT_KEY = 'fms_delay_alert_sent';
const MAX_LINES = 40;
const STALE_MS = 7 * 24 * 3600 * 1000;
const KINDS = ['late', 'list', 'done'];

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

// { [stepId]: { late, list, done } } — each a group spec ("SKM, Stone Order
// {branch}") or ''. A bare string is the first version's shape (late only).
function normalize(map) {
  const out = {};
  for (const [stepId, v] of Object.entries(map || {})) {
    const e = typeof v === 'string' ? { late: v } : (v || {});
    const clean = Object.fromEntries(KINDS.map((k) => [k, String(e[k] || '').trim()]));
    if (stepId && KINDS.some((k) => clean[k])) out[stepId] = clean;
  }
  return out;
}

export async function getDelayAlertConfig() {
  try { return normalize(JSON.parse((await readConfig(CONFIG_KEY)) || '{}')); } catch { return {}; }
}

export async function saveDelayAlertConfig(map) {
  const clean = normalize(map);
  await ensureSchema();
  await writeConfig(CONFIG_KEY, JSON.stringify(clean));
  return clean;
}

function fmtPlanned(v) {
  return String(v || '').replace(/:\d{2}$/, '').trim();
}

function itemLine(r, kind) {
  const who = `${r.orderNo || '-'}${r.client ? ` — ${r.client}` : ''}${r.area ? ` (${r.area})` : ''}`;
  // A list item's wait counts from its Planned time — for Dispatch that is
  // when packing finished.
  let when;
  if (kind === 'late') when = `due ${fmtPlanned(r.planned)} · *${delayText(r.lateMs)} late*`;
  else if (r.lateMs > 0) when = `waiting *${delayText(r.lateMs)}*`;
  else when = `due ${fmtPlanned(r.planned) || '—'}`;
  const stale = kind === 'list' && r.lateMs > STALE_MS ? '⚠️ ' : '';
  return `• ${stale}${who} · ${when}${r.doer ? ` · ${r.doer}` : ''}`;
}

export function delayDigest(groupName, rows, kind = 'late') {
  const byStep = new Map();
  for (const r of [...rows].sort((a, b) => b.lateMs - a.lateMs)) {
    const k = `${r.fmsName} · ${r.stepName}`;
    if (!byStep.has(k)) byStep.set(k, []);
    byStep.get(k).push(r);
  }
  const stale = rows.filter((r) => r.lateMs > STALE_MS).length;
  const lines = kind === 'late'
    ? [`⏰ *DELAYED WORK — ${groupName}*`, `${rows.length} item${rows.length > 1 ? 's' : ''} past the target date`]
    : [`📋 *PENDING LIST — ${groupName}*`, `${rows.length} item${rows.length > 1 ? 's' : ''} waiting${stale ? ` · ⚠️ ${stale} for more than 7 days` : ''}`];
  let shown = 0;
  for (const [step, items] of byStep) {
    lines.push('', `📍 *${step}*`);
    for (const r of items) {
      if (shown >= MAX_LINES) break;
      lines.push(itemLine(r, kind));
      shown++;
    }
  }
  if (rows.length > shown) lines.push('', `…and ${rows.length - shown} more — see Live Tracking.`);
  return lines.join('\n');
}

// Route rows to groups by their step's spec for `kind` → Map jid → { name, rows }.
function route(rows, config, kind, groups, unset) {
  const byJid = new Map();
  for (const r of rows) {
    for (const t of resolveTargets(config[r.stepId]?.[kind], groups, { orderNo: r.orderNo })) {
      if (!t.jid) { unset.add(t.name); continue; }
      if (!byJid.has(t.jid)) byJid.set(t.jid, { name: t.name, rows: [] });
      byJid.get(t.jid).rows.push(r);
    }
  }
  return byJid;
}

/**
 * The daily run: late digests and pending lists, one message per group per
 * kind. Returns { groups: [{ name, kind, items, sent }], unset: [names],
 * overdue, pending } so the admin's "Send now" can show what happened.
 */
export async function sendDelayAlerts() {
  const config = await getDelayAlertConfig();
  const lateSteps = Object.keys(config).filter((id) => config[id].late);
  const listSteps = Object.keys(config).filter((id) => config[id].list);
  if (!lateSteps.length && !listSteps.length) return { groups: [], unset: [], overdue: 0, pending: 0 };

  const [groups, overdue, pending] = await Promise.all([
    getAlertGroups(),
    lateSteps.length ? getOverdueRows(lateSteps) : [],
    listSteps.length ? getOverdueRows(listSteps, { all: true }) : [],
  ]);
  const unset = new Set();
  const result = [];
  for (const [kind, rows] of [['late', overdue], ['list', pending]]) {
    for (const [jid, g] of route(rows, config, kind, groups, unset)) {
      let sent = false;
      if (isWhatsappConfigured()) {
        try { await sendWhatsApp(jid, delayDigest(g.name, g.rows, kind)); sent = true; }
        catch (e) { console.error(`[step alerts] ${kind} ${g.name}:`, e.message); }
      }
      result.push({ name: g.name, kind, items: g.rows.length, sent });
    }
  }
  return { groups: result, unset: [...unset], overdue: overdue.length, pending: pending.length };
}

/**
 * A row was just marked done — send its order details to the step's "done"
 * group, if one is set. Best-effort: the completion is already saved, so a
 * failure here is only logged.
 */
export async function notifyStepDone({ sheet, step, rowNumber, doerName = '' }) {
  const spec = (await getDelayAlertConfig())[step.id]?.done;
  if (!spec || !isWhatsappConfigured()) return;
  const d = await rowDetails(sheet, rowNumber);
  const targets = resolveTargets(spec, await getAlertGroups(), { orderNo: d.orderNo }).filter((t) => t.jid);
  if (!targets.length) return;
  const msg = [
    `✅ *${step.step_name} — done*`,
    `${sheet.fms_name || sheet.sheet_name}`, '',
    ...d.fields.map((f) => `${f.header}: ${f.value}`),
    doerName ? `\n👤 Done by: ${doerName}` : null,
  ].filter((l) => l !== null).join('\n');
  await Promise.all(targets.map((t) => sendWhatsApp(t.jid, msg)
    .catch((e) => console.error(`[step alerts] done ${t.name}:`, e.message))));
}

export async function delayAlertsSentToday() {
  return (await readConfig(SENT_KEY)) === istDateStr();
}

export async function markDelayAlertsSent() {
  await writeConfig(SENT_KEY, istDateStr());
}

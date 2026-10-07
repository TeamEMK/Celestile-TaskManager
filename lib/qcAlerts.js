/**
 * O2D quality-check alerts.
 *
 * Every checklist in the factory O2D flow (inventory Step 2, Program File
 * Checklist, Check & Understand, the final Quality Checklist) works the same
 * way: a "No" — or "Yes" on a question like "Extra finishing required?" —
 * means someone upstream made a mistake, so it goes straight to that team's
 * WhatsApp group and the work is held for a recheck.
 *
 * Two things live here:
 *   - the named WhatsApp groups ("Design", "SKM", "HOD Stone"…), editable from
 *     the FMS page and stored as one JSON blob in app_config, so a checklist
 *     field names a group rather than carrying a raw …@g.us JID;
 *   - raiseQcAlert(), which sends the alert AND logs it to qc_alerts. That
 *     log is the rework record the owner asked for — how many times each
 *     order bounced back, and at which check.
 *
 * Targets can route per order: "Stone Order {branch}" picks the Hyderabad or
 * Bangalore group from the order number's first letter (H… / B…), and
 * "HOD {material}" picks the HOD group of that material's department.
 */
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, isWhatsappConfigured } from '@/lib/whatsapp';
import { newId } from '@/lib/ids';

const CONFIG_KEY = 'qc_alert_groups';

// Groups the O2D checklists name. Only Design has a known JID today (the
// design daily-report group); the rest are filled in from the FMS page.
export function defaultAlertGroups() {
  return {
    'Design': process.env.DESIGN_GROUP_ID || '918050005533-1568964481@g.us',
    'SKM': process.env.SKM_GROUP_ID || '',
    'Stone Order HYD': '',
    'Stone Order BLR': '',
    'HOD Stone': '',
    'HOD Tile': '',
    'HOD MOP': '',
    'HOD Brass': '',
  };
}

export async function getAlertGroups() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [CONFIG_KEY]);
  let saved = {};
  try { saved = JSON.parse(rows?.[0]?.value || '{}') || {}; } catch { saved = {}; }
  return { ...defaultAlertGroups(), ...saved };
}

export async function saveAlertGroups(groups) {
  await ensureSchema();
  const clean = {};
  for (const [name, jid] of Object.entries(groups || {})) {
    const n = String(name || '').trim();
    if (n) clean[n] = String(jid || '').trim();
  }
  const value = JSON.stringify(clean);
  await pool.query(
    'INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [CONFIG_KEY, value, value]
  );
  return clean;
}

// H1774 → HYD, B514 → BLR. Anything else has no branch group.
export function branchOfOrder(orderNo) {
  const c = String(orderNo || '').trim().toUpperCase()[0];
  return c === 'H' ? 'HYD' : c === 'B' ? 'BLR' : '';
}

// "Design, SKM, HOD {material}" → [{ name, jid }]. A name that resolves to no
// JID is still returned (jid '') so the caller can say which group is unset.
export function resolveTargets(spec, groups, { orderNo = '', material = '' } = {}) {
  const byLower = new Map(Object.entries(groups || {}).map(([n, j]) => [n.toLowerCase(), { name: n, jid: j }]));
  const out = [];
  const seen = new Set();
  for (const raw of String(spec || '').split(/[,\n]+/)) {
    let name = raw.trim();
    if (!name) continue;
    name = name
      .replace(/\{branch\}/gi, branchOfOrder(orderNo))
      .replace(/\{material\}/gi, String(material || '').trim())
      .replace(/\s+/g, ' ').trim();
    const hit = /@(g\.us|c\.us)$/.test(name) ? { name, jid: name } : (byLower.get(name.toLowerCase()) || { name, jid: '' });
    if (seen.has(hit.name.toLowerCase())) continue;
    seen.add(hit.name.toLowerCase());
    out.push(hit);
  }
  return out;
}

async function priorAlertCount(orderNo) {
  if (!orderNo) return 0;
  const [rows] = await pool.query('SELECT id FROM qc_alerts WHERE order_no = ?', [orderNo]);
  return (rows || []).length;
}

export function qcAlertMessage(a) {
  return [
    `⚠️ *QC ALERT — ${a.source || 'O2D'}*`, '',
    `🧾 Order: ${a.orderNo || '-'}${a.area ? ` (${a.area})` : ''}`,
    a.material ? `🪨 Material: ${a.material}` : null,
    a.stepName ? `📍 Step: ${a.stepName}` : null,
    `❌ ${a.check}: *${a.answer}*`,
    a.note ? `📝 ${a.note}` : null,
    a.photo ? `📷 ${a.photo}` : null,
    `👤 Raised by: ${a.raisedBy || '-'}`,
    a.count > 1 ? `🔁 Alert #${a.count} on this order` : null,
  ].filter((l) => l !== null).join('\n');
}

/**
 * Log one failed check and send it to its groups. Sending is best-effort —
 * a WhatsApp outage must not lose the record — but the log write is not.
 *
 * Returns { sentTo: [names], unset: [names] } so the form can tell the doer
 * which groups were reached and which still need a JID.
 */
export async function raiseQcAlert({
  source, stepName = '', orderNo = '', area = '', material = '',
  check, answer, note = '', photo = '', to, raisedBy = '', raisedById = null,
}) {
  await ensureSchema();
  const groups = await getAlertGroups();
  const targets = resolveTargets(to, groups, { orderNo, material });
  const reachable = targets.filter((t) => t.jid);
  const count = (await priorAlertCount(orderNo)) + 1;

  await pool.query(
    `INSERT INTO qc_alerts (id, created_at, order_no, area, material, source, step_name, check_label, answer, note, photo, sent_to, raised_by, raised_by_id)
     VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId('QCA'), orderNo, area, material, source || '', stepName, check || '', answer || '',
      note, photo, targets.map((t) => t.name).join(', '), raisedBy, raisedById]
  );

  if (isWhatsappConfigured() && reachable.length) {
    const msg = qcAlertMessage({ source, stepName, orderNo, area, material, check, answer, note, photo, raisedBy, count });
    await Promise.all(reachable.map((t) => sendWhatsApp(t.jid, msg)
      .catch((e) => console.error(`[qc alert] ${t.name}:`, e.message))));
  }
  return { sentTo: reachable.map((t) => t.name), unset: targets.filter((t) => !t.jid).map((t) => t.name) };
}

export async function listQcAlerts() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM qc_alerts');
  return (rows || [])
    .map((r) => ({ ...r, created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at || '') }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

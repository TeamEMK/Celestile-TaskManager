import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, isWhatsappConfigured } from '@/lib/whatsapp';
import { requireAccess, currentUser } from '@/lib/api';
import { maybeUploadToDrive } from '@/lib/googleDrive';
import { newId } from '@/lib/ids';
import { findByOrder, resolveRow, writeRows, appendSlabs } from '@/lib/imsSheet';
import { lookupOrderStoneType, completeLinkedStepRows } from '@/lib/fmsSheet';
import { STEP2_URL_RE } from '@/lib/fmsOpenUrl';
import { raiseQcAlert } from '@/lib/qcAlerts';

// Slabs come from the IMS spreadsheet (lib/imsSheet.js). The Step-2 header
// record has no home in that sheet's layout, so it stays in the app's own
// fsm_step2 table.

const NOTIFY = () => process.env.INVENTORY_NOTIFY || '120363428784416671@g.us';
const num = (v) => parseFloat(v) || 0;

// GET ?orderNo=... → every slab ever attached to that order, any status —
// Used/Sold rows stay visible for context, the UI just disables editing on
// them. Use the `status` field to gate actions.
export async function GET(req) {
  const gate = await requireAccess('/inventory'); if (gate) return gate;
  try {
    const orderNo = (new URL(req.url).searchParams.get('orderNo') || '').trim();
    if (!orderNo) return NextResponse.json({ error: 'orderNo required' }, { status: 400 });
    const rows = await findByOrder(orderNo);
    const slabs = rows.map((r) => ({
      id: r.id, slab: r.slab, material: r.material, thickness: r.thickness,
      sizeL: r.sizeL, sizeW: r.sizeW, sft: r.sft, status: r.status, key: r.key,
      client: r.client, area: r.area,
    }));
    if (!slabs.length) return NextResponse.json({ orderNo, key: orderNo, client: '', area: '', slabs: [] });
    // What the order form said the stone is — the Material dropdown starts
    // from it. A sheet hiccup just leaves the dropdown for the doer.
    const stoneType = await lookupOrderStoneType(orderNo).catch(() => '');
    return NextResponse.json({
      orderNo, key: slabs[0].key || orderNo, client: slabs[0].client || '', area: slabs[0].area || '', slabs, stoneType,
    });
  } catch (err) {
    console.error('[inventory/step2 GET]', err.message);
    return NextResponse.json({ error: 'Failed to load slabs for order' }, { status: 500 });
  }
}

// PATCH { orderNo, from, to } → bulk-transition every slab in an order between
// two statuses (e.g. Blocked → Step2 to start review, or back).
export async function PATCH(req) {
  const gate = await requireAccess('/inventory'); if (gate) return gate;
  try {
    const { orderNo, from, to } = await req.json();
    if (!orderNo || !from || !to) return NextResponse.json({ error: 'orderNo, from, to required' }, { status: 400 });
    const updatedAt = new Date().toISOString();
    const updates = (await findByOrder(orderNo))
      .filter((r) => String(r.status) === from)
      .map((r) => ({ row: r.__row, obj: { ...r, status: to, updatedAt } }));
    await writeRows(updates);
    return NextResponse.json({ ok: true, count: updates.length });
  } catch (err) {
    console.error('[inventory/step2 PATCH]', err.message);
    return NextResponse.json({ error: 'Failed to update slabs' }, { status: 500 });
  }
}

// POST submit Step 2: record cutting, mark Used, create remnants, log + WhatsApp
export async function POST(req) {
  const gate = await requireAccess('/inventory'); if (gate) return gate;
  try {
    await ensureSchema();
    const info = await req.json();
    const orderNo = String(info.orderNo || '').trim();
    const cuttingRows = Array.isArray(info.cuttingRows) ? info.cuttingRows : [];

    let message = '🪨 *STEP 2 UPDATE*\n\n';
    let hasCutting = false;
    // "No issue" (current form) and "No" (older submits) both mean clean.
    const hasIssue = !!info.issue && !['no', 'no issue'].includes(String(info.issue).trim().toLowerCase());
    const createdAt = new Date().toISOString();

    // Resolve every slab first, then write once — each sheet write invalidates
    // the cache, so interleaving them would re-read the register per slab.
    const byOrder = await findByOrder(orderNo);
    const updates = [];
    const remnants = [];

    for (const row of cuttingRows) {
      const r = row.id
        ? await resolveRow(row.id)
        : byOrder.find((x) => String(x.slab) === String(row.slab));
      if (!r) continue;
      // Skip slabs that already moved past Step 2 (Used/Sold) — a stale form
      // re-submit must not drag a sold slab back into the cutting workflow.
      if (!['Blocked', 'Step2'].includes(String(r.status))) continue;

      const origL = num(r.sizeL), origW = num(r.sizeW);
      const origSFT = (origL * origW) / 144;

      updates.push({
        row: r.__row,
        obj: {
          ...r,
          cutting: row.cutting || '', cuttingReason: row.cuttingReason || '',
          cuttingSizeL: row.cuttingSizeL || '', cuttingSizeW: row.cuttingSizeW || '',
          status: 'Used', updatedAt: createdAt,
        },
      });

      message += `🔹 *Material:* ${r.material} -- ${r.thickness}\n🧾 *Order No:* ${orderNo}\n\n`;
      message += `📦 *Slab:* ${r.slab}\nOrg :- ${origL} x ${origW}  |  SFT : ${origSFT.toFixed(2)}\n`;

      if (row.cutting === 'Yes') {
        hasCutting = true;
        const usedL = num(row.cuttingSizeL), usedW = num(row.cuttingSizeW);
        const cutSFT = (usedL * usedW) / 144;
        message += `Cut :- ${usedL} x ${usedW}  |  SFT : ${cutSFT.toFixed(2)}  |  Reason : ${row.cuttingReason || '-'}\n\n`;

        const remL = Math.max(origL - usedL, 0), remW = Math.max(origW - usedW, 0);
        if (remL > 0 && remW > 0) {
          remnants.push({
            createdAt, key: (r.key || '') + '-R', slab: (r.slab || '') + '-REM', block: r.block || '-',
            material: r.material || '', thickness: r.thickness || '',
            sizeL: remL, sizeW: remW, sft: ((remL * remW) / 144).toFixed(2),
            slabPhoto: '', status: 'Available', updatedAt: '',
            orderNo: '', client: '', area: '', cutting: '', cuttingReason: '',
            cuttingSizeL: '', cuttingSizeW: '', remarks: `Remnant of ${r.slab}`,
          });
        }
      } else {
        message += 'Cut :- ❌ No Cutting\n\n';
      }
    }

    await writeRows(updates);
    await appendSlabs(remnants);

    if (hasIssue) message += `⚠️ *Material Issue:* ${info.issue}\n\n`;

    // FSM log
    const [grainImg, matImg] = await Promise.all([
      maybeUploadToDrive(info.grainImg, 'step2-grain'),
      maybeUploadToDrive(info.matImg, 'step2-material'),
    ]);
    await pool.query(
      `INSERT INTO fsm_step2 (id, inv_key, created_at, order_no, material, all_pieces, grain, grain_img, issue, cutting_required, mat_img, sizes_packing)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [newId('FSM'), info.key || orderNo, createdAt, orderNo, info.material || '', info.allPieces || '',
       info.grain || '', grainImg || '', info.issue || '', hasCutting ? 'Yes' : 'No', matImg || '', info.sizesPacking || '']
    );

    if ((hasCutting || hasIssue) && isWhatsappConfigured()) {
      try { await sendWhatsApp(NOTIFY(), message); } catch (err) { console.error('[step2 notify]', err.message); }
    }

    // "Step 2 No hone pe msg SKM group mai" (28-10-2026 review): a No on
    // Grain matching or All pieces used goes to SKM as a QC alert (logged
    // as rework on the order too). The blocking itself is still saved.
    const isNo = (v) => /^(n|no)$/i.test(String(v || '').trim());
    const raiser = await currentUser().catch(() => null);
    for (const [check, v, photo] of [['Grain matching', info.grain, grainImg], ['All pieces used?', info.allPieces, '']]) {
      if (!isNo(v)) continue;
      try {
        await raiseQcAlert({
          source: 'Inventory Step 2', stepName: 'Sort Raw Material and Quality checking',
          orderNo, material: info.material || '', check, answer: 'No', photo: photo || '',
          note: hasIssue ? `Material issue: ${info.issue}` : '', to: 'SKM',
          raisedBy: raiser?.name || '', raisedById: raiser?.id || null,
        });
      } catch (err) { console.error('[step2 qc alert]', err.message); }
    }

    // The FMS step that sends the doer here ("Sort Raw Material and Quality
    // checking") is done by this submit — mark it, for the areas whose slabs
    // were just used. Best-effort: the blocking is already saved.
    let stepsDone = 0;
    if (updates.length) {
      try {
        const user = await currentUser();
        stepsDone = await completeLinkedStepRows({
          urlRe: STEP2_URL_RE, orderNo,
          areas: [...new Set(updates.map((u) => String(u.obj.area || '').trim()))],
          doerName: user?.name || '', doerId: user?.id || null,
        });
      } catch (err) { console.error('[step2 → fms step]', err.message); }
    }

    return NextResponse.json({ ok: true, count: updates.length, stepsDone });
  } catch (err) {
    console.error('[inventory/step2 POST]', err.message);
    return NextResponse.json({ error: 'Failed to submit step 2' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, isWhatsappConfigured } from '@/lib/whatsapp';
import { requireUser } from '@/lib/api';
import { maybeUploadToDrive } from '@/lib/googleDrive';
import { findByOrder, resolveRow, writeRows, appendSlabs } from '@/lib/imsSheet';

// Slabs come from the IMS spreadsheet (lib/imsSheet.js). The Step-2 header
// record has no home in that sheet's layout, so it stays in the app's own
// fsm_step2 table.

const NOTIFY = () => process.env.INVENTORY_NOTIFY || '120363428784416671@g.us';
const uid = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
const num = (v) => parseFloat(v) || 0;

// GET ?orderNo=... → every slab ever attached to that order, any status —
// Used/Sold rows stay visible for context, the UI just disables editing on
// them. Use the `status` field to gate actions.
export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
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
    return NextResponse.json({
      orderNo, key: slabs[0].key || orderNo, client: slabs[0].client || '', area: slabs[0].area || '', slabs,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH { orderNo, from, to } → bulk-transition every slab in an order between
// two statuses (e.g. Blocked → Step2 to start review, or back).
export async function PATCH(req) {
  const gate = await requireUser(); if (gate) return gate;
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST submit Step 2: record cutting, mark Used, create remnants, log + WhatsApp
export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const info = await req.json();
    const orderNo = String(info.orderNo || '').trim();
    const cuttingRows = Array.isArray(info.cuttingRows) ? info.cuttingRows : [];

    let message = '🪨 *STEP 2 UPDATE*\n\n';
    let hasCutting = false;
    const hasIssue = info.issue && String(info.issue).toLowerCase() !== 'no';
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
      [uid('FSM'), info.key || orderNo, createdAt, orderNo, info.material || '', info.allPieces || '',
       info.grain || '', grainImg || '', info.issue || '', hasCutting ? 'Yes' : 'No', matImg || '', info.sizesPacking || '']
    );

    if ((hasCutting || hasIssue) && isWhatsappConfigured()) {
      try { await sendWhatsApp(NOTIFY(), message); } catch (err) { console.error('[step2 notify]', err.message); }
    }

    return NextResponse.json({ ok: true, count: updates.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

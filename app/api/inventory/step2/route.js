import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, isWhatsappConfigured } from '@/lib/whatsapp';
import { requireUser } from '@/lib/api';
import { maybeUploadToDrive } from '@/lib/googleDrive';

const NOTIFY = () => process.env.INVENTORY_NOTIFY || '918008002121';
const uid = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
const num = (v) => parseFloat(v) || 0;

// GET ?orderNo=... → every slab ever attached to that order (self-contained:
// from inventory), any status — Used/Sold rows stay visible for context, the
// UI just disables editing on them. Use the `status` field to gate actions.
export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const orderNo = (new URL(req.url).searchParams.get('orderNo') || '').trim();
    if (!orderNo) return NextResponse.json({ error: 'orderNo required' }, { status: 400 });
    const [rows] = await pool.query('SELECT * FROM inventory WHERE order_no = ?', [orderNo]);
    const slabs = rows.map((r) => ({
      id: r.id, slab: r.slab, material: r.material, thickness: r.thickness,
      sizeL: r.size_l, sizeW: r.size_w, sft: r.sft, status: r.status, key: r.inv_key,
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
// two statuses in one query (e.g. Blocked → Step2 to start review, or back).
export async function PATCH(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const { orderNo, from, to } = await req.json();
    if (!orderNo || !from || !to) return NextResponse.json({ error: 'orderNo, from, to required' }, { status: 400 });
    const [result] = await pool.query(
      'UPDATE inventory SET status=?, updated_at=? WHERE order_no=? AND status=?',
      [to, new Date().toISOString(), orderNo, from]
    );
    return NextResponse.json({ ok: true, count: result.affectedRows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST submit Step 2: update cutting, mark Used, create remnants, log + WhatsApp
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

    for (const row of cuttingRows) {
      // match by id (preferred) else by slab + order
      const [found] = row.id
        ? await pool.query('SELECT * FROM inventory WHERE id = ?', [row.id])
        : await pool.query('SELECT * FROM inventory WHERE order_no = ? AND slab = ?', [orderNo, row.slab]);
      if (!found.length) continue;
      const r = found[0];
      // Skip slabs that already moved past Step 2 (Used/Sold) — a stale form
      // re-submit must not drag a sold slab back into the cutting workflow.
      if (!['Blocked', 'Step2'].includes(String(r.status))) continue;

      const origL = num(r.size_l), origW = num(r.size_w);
      const origSFT = (origL * origW) / 144;

      await pool.query(
        `UPDATE inventory SET cutting=?, cutting_reason=?, cutting_size_l=?, cutting_size_w=?, status='Used', updated_at=? WHERE id=?`,
        [row.cutting || '', row.cuttingReason || '', row.cuttingSizeL || '', row.cuttingSizeW || '', createdAt, r.id]
      );

      message += `🔹 *Material:* ${r.material} -- ${r.thickness}\n🧾 *Order No:* ${orderNo}\n\n`;
      message += `📦 *Slab:* ${r.slab}\nOrg :- ${origL} x ${origW}  |  SFT : ${origSFT.toFixed(2)}\n`;

      if (row.cutting === 'Yes') {
        hasCutting = true;
        const usedL = num(row.cuttingSizeL), usedW = num(row.cuttingSizeW);
        const cutSFT = (usedL * usedW) / 144;
        message += `Cut :- ${usedL} x ${usedW}  |  SFT : ${cutSFT.toFixed(2)}  |  Reason : ${row.cuttingReason || '-'}\n\n`;

        const remL = Math.max(origL - usedL, 0), remW = Math.max(origW - usedW, 0);
        const remSFT = (remL * remW) / 144;
        if (remL > 0 && remW > 0) {
          await pool.query(
            `INSERT INTO inventory (id, created_at, inv_key, slab, block, material, thickness, size_l, size_w, sft, status)
             VALUES (?,?,?,?,?,?,?,?,?,?, 'Available')`,
            [uid('INV'), createdAt, (r.inv_key || '') + '-R', (r.slab || '') + '-REM', r.block || '-',
             r.material || '', r.thickness || '', remL, remW, remSFT.toFixed(2)]
          );
        }
      } else {
        message += 'Cut :- ❌ No Cutting\n\n';
      }
    }

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

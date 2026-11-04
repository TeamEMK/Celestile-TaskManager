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
const isNo = (v) => /^(n|no)$/i.test(String(v || '').trim());

// "Checklist mai No hai to aage ke step mai nahi jayega jab tak puri Yes nahi
// ho jati" (03-11-2026): a No on Grain matching / All pieces used keeps the
// FMS step pending. The slabs are Used by then, so the form can't be sent
// again — the order's latest Step-2 record says whether it still needs a
// re-check, which the page offers until both answers are Yes.
async function pendingRecheck(orderNo) {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM fsm_step2 WHERE order_no = ?', [orderNo]);
  const last = (rows || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  if (!last || !(isNo(last.grain) || isNo(last.all_pieces))) return null;
  return { grain: last.grain || '', allPieces: last.all_pieces || '', material: last.material || '', at: last.created_at };
}

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
    const recheck = await pendingRecheck(orderNo).catch(() => null);
    if (!slabs.length) return NextResponse.json({ orderNo, key: orderNo, client: '', area: '', slabs: [], recheck });
    // What the order form said the stone is — the Material dropdown starts
    // from it. A sheet hiccup just leaves the dropdown for the doer.
    const stoneType = await lookupOrderStoneType(orderNo).catch(() => '');
    return NextResponse.json({
      orderNo, key: slabs[0].key || orderNo, client: slabs[0].client || '', area: slabs[0].area || '', slabs, stoneType, recheck,
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
    if (info.recheck) return recheckStep2(orderNo, info);
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
    const raiser = await currentUser().catch(() => null);
    const usedAreas = [...new Set(updates.map((u) => String(u.obj.area || '').trim()).filter(Boolean))].join(', ');
    for (const [check, v, photo] of [['Grain matching', info.grain, grainImg], ['All pieces used?', info.allPieces, '']]) {
      if (!isNo(v)) continue;
      try {
        await raiseQcAlert({
          source: 'Inventory Step 2', stepName: 'Sort Raw Material and Quality checking',
          orderNo, area: usedAreas, material: info.material || '', check, answer: 'No', photo: photo || '',
          note: hasIssue ? `Material issue: ${info.issue}` : '', to: 'SKM',
          raisedBy: raiser?.name || '', raisedById: raiser?.id || null,
        });
      } catch (err) { console.error('[step2 qc alert]', err.message); }
    }

    // The FMS step that sends the doer here ("Sort Raw Material and Quality
    // checking") is done by this submit — mark it, for the areas whose slabs
    // were just used. Best-effort: the blocking is already saved.
    // …unless the checklist said No: then it waits for a re-check.
    const held = isNo(info.grain) || isNo(info.allPieces);
    let stepsDone = 0;
    if (updates.length && !held) {
      try {
        const user = await currentUser();
        stepsDone = await completeLinkedStepRows({
          urlRe: STEP2_URL_RE, orderNo,
          areas: [...new Set(updates.map((u) => String(u.obj.area || '').trim()))],
          doerName: user?.name || '', doerId: user?.id || null,
        });
      } catch (err) { console.error('[step2 → fms step]', err.message); }
    }

    return NextResponse.json({ ok: true, count: updates.length, stepsDone, held });
  } catch (err) {
    console.error('[inventory/step2 POST]', err.message);
    return NextResponse.json({ error: 'Failed to submit step 2' }, { status: 500 });
  }
}

// Re-check after a No: { recheck: true, orderNo, grain, allPieces }. Logged
// as a Step-2 record like the first answer; all Yes marks the FMS step done,
// another No alerts SKM again and keeps it waiting.
async function recheckStep2(orderNo, info) {
  try {
    if (!orderNo) return NextResponse.json({ error: 'orderNo required' }, { status: 400 });
    const yesNo = (v) => /^(y|yes|n|no)$/i.test(String(v || '').trim());
    if (!yesNo(info.grain) || !yesNo(info.allPieces)) {
      return NextResponse.json({ error: 'Answer both: Grain matching and All pieces used' }, { status: 400 });
    }
    const prev = await pendingRecheck(orderNo);
    const user = await currentUser().catch(() => null);
    await pool.query(
      `INSERT INTO fsm_step2 (id, inv_key, created_at, order_no, material, all_pieces, grain, grain_img, issue, cutting_required, mat_img, sizes_packing)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [newId('FSM'), orderNo, new Date().toISOString(), orderNo, prev?.material || '', info.allPieces, info.grain, '',
       `Re-check by ${user?.name || 'unknown'}`, '', '', '']
    );
    // The slabs were attached on the first submit — their areas name the
    // order's areas for the alert. A sheet hiccup just leaves it out.
    const areas = [...new Set((await findByOrder(orderNo).catch(() => []))
      .map((r) => String(r.area || '').trim()).filter(Boolean))].join(', ');
    const failed = [['Grain matching', info.grain], ['All pieces used?', info.allPieces]].filter(([, v]) => isNo(v));
    for (const [check] of failed) {
      try {
        await raiseQcAlert({
          source: 'Inventory Step 2 (re-check)', stepName: 'Sort Raw Material and Quality checking',
          orderNo, area: areas, material: prev?.material || '', check, answer: 'No', photo: '', note: 'Still No on re-check',
          to: 'SKM', raisedBy: user?.name || '', raisedById: user?.id || null,
        });
      } catch (err) { console.error('[step2 recheck alert]', err.message); }
    }
    if (failed.length) return NextResponse.json({ ok: true, held: true, stepsDone: 0 });
    const stepsDone = await completeLinkedStepRows({ urlRe: STEP2_URL_RE, orderNo, doerName: user?.name || '', doerId: user?.id || null });
    return NextResponse.json({ ok: true, held: false, stepsDone });
  } catch (err) {
    console.error('[inventory/step2 recheck]', err.message);
    return NextResponse.json({ error: 'Failed to save the re-check' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, slabBlockedMessage, slabReleasedMessage, isWhatsappConfigured } from '@/lib/whatsapp';
import { requireUser } from '@/lib/api';
import { maybeUploadToDrive } from '@/lib/googleDrive';

const NOTIFY = () => process.env.INVENTORY_NOTIFY || '918008002121';
const uid = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

function rowToInv(r) {
  return {
    id: r.id, createdAt: r.created_at || '', key: r.inv_key || '', slab: r.slab || '',
    block: r.block || '-', material: r.material || '', thickness: r.thickness || '',
    sizeL: r.size_l || '', sizeW: r.size_w || '', sft: r.sft || '', slabPhoto: r.slab_photo || '',
    status: r.status || 'Available', updatedAt: r.updated_at || '', orderNo: r.order_no || '',
    client: r.client || '', area: r.area || '', cutting: r.cutting || '', cuttingReason: r.cutting_reason || '',
    cuttingSizeL: r.cutting_size_l || '', cuttingSizeW: r.cutting_size_w || '', remarks: r.remarks || '',
  };
}

// CE-DD-MM-LOT-XXX (incremental lot per the running row count, mirrors generateUniqueKey)
function makeKey(seq) {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  return `CE-${day}-${mon}-LOT-${String(seq).padStart(3, '0')}`;
}

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const [rows] = await pool.query('SELECT * FROM inventory');
    const out = rows
      .filter((r) => r.slab)
      .map(rowToInv)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length) return NextResponse.json({ error: 'No entries' }, { status: 400 });

    const [c] = await pool.query('SELECT COUNT(*) AS cnt FROM inventory');
    let seq = Number(c[0]?.cnt || 0);
    const createdAt = new Date().toISOString();

    for (const e of entries) {
      seq += 1;
      const slabPhoto = await maybeUploadToDrive(e.slabPhoto, 'slab-photo');
      await pool.query(
        `INSERT INTO inventory
          (id, created_at, inv_key, slab, block, material, thickness, size_l, size_w, sft,
           slab_photo, status, order_no, client, area, cutting, cutting_reason, cutting_size_l, cutting_size_w, remarks)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uid('INV'), createdAt, makeKey(seq), e.slab || '', e.block || '-', e.material || '', e.thickness || '',
         e.sizeL || '', e.sizeW || '', e.sft || '', slabPhoto || '', e.status || 'Available',
         e.orderNo || '', e.client || '', e.area || '', e.cutting || '', e.cuttingReason || '',
         e.cuttingSizeL || '', e.cuttingSizeW || '', e.remarks || '']
      );
    }
    return NextResponse.json({ ok: true, count: entries.length }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Multi-select "Add Slabs" (Step 2) blocks several available slabs to the same
// order in one request instead of firing one PATCH per slab from the client.
// Only status/order/client/area move here — per-slab detail edits (size,
// photo, etc.) still go through the single-id path below.
async function patchBulk(ids, e) {
  const results = [];
  for (const id of ids) {
    const [cur] = await pool.query('SELECT * FROM inventory WHERE id = ?', [id]);
    if (!cur.length) continue;
    const prev = rowToInv(cur[0]);
    const next = {
      status: e.status ?? prev.status, orderNo: e.orderNo ?? prev.orderNo,
      client: e.client ?? prev.client, area: e.area ?? prev.area,
    };
    await pool.query(
      'UPDATE inventory SET status=?, updated_at=?, order_no=?, client=?, area=? WHERE id=?',
      [next.status, new Date().toISOString(), next.orderNo, next.client, next.area, id]
    );
    if (isWhatsappConfigured() && prev.status !== 'Blocked' && next.status === 'Blocked') {
      try { await sendWhatsApp(NOTIFY(), slabBlockedMessage({ ...prev, ...next })); }
      catch (err) { console.error('[inventory notify]', err.message); }
    }
    results.push(id);
  }
  return results;
}

export async function PATCH(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const e = await req.json();

    if (Array.isArray(e.ids) && e.ids.length) {
      const updated = await patchBulk(e.ids, e);
      return NextResponse.json({ ok: true, count: updated.length });
    }

    if (!e.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const [cur] = await pool.query('SELECT * FROM inventory WHERE id = ?', [e.id]);
    if (!cur.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const prev = rowToInv(cur[0]);

    const next = {
      slab: e.slab ?? prev.slab, material: e.material ?? prev.material, thickness: e.thickness ?? prev.thickness,
      sizeL: e.sizeL ?? prev.sizeL, sizeW: e.sizeW ?? prev.sizeW, sft: e.sft ?? prev.sft,
      slabPhoto: await maybeUploadToDrive(e.slabPhoto ?? prev.slabPhoto, 'slab-photo'), status: e.status ?? prev.status,
      orderNo: e.orderNo ?? prev.orderNo, client: e.client ?? prev.client, area: e.area ?? prev.area,
      remarks: e.remarks ?? prev.remarks,
    };

    await pool.query(
      `UPDATE inventory SET slab=?, material=?, thickness=?, size_l=?, size_w=?, sft=?, slab_photo=?,
        status=?, updated_at=?, order_no=?, client=?, area=?, remarks=? WHERE id=?`,
      [next.slab, next.material, next.thickness, next.sizeL, next.sizeW, next.sft, next.slabPhoto,
       next.status, new Date().toISOString(), next.orderNo, next.client, next.area, next.remarks, e.id]
    );

    // WhatsApp on Available→Blocked / Blocked→Available
    if (isWhatsappConfigured()) {
      try {
        if (prev.status !== 'Blocked' && next.status === 'Blocked') {
          await sendWhatsApp(NOTIFY(), slabBlockedMessage(next));
        } else if (prev.status === 'Blocked' && next.status === 'Available') {
          await sendWhatsApp(NOTIFY(), slabReleasedMessage(next));
        }
      } catch (err) { console.error('[inventory notify]', err.message); }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await pool.query('DELETE FROM inventory WHERE id = ?', [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

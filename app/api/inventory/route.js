import { NextResponse } from 'next/server';
import { sendWhatsApp, slabBlockedMessage, slabReleasedMessage, isWhatsappConfigured } from '@/lib/whatsapp';
import { requireUser } from '@/lib/api';
import { maybeUploadToDriveWithLink } from '@/lib/googleDrive';
import { listSlabs, resolveRow, appendSlabs, writeRows, deleteRow, nextLotKey, publicSlab } from '@/lib/imsSheet';

// The slab register lives in the factory's IMS spreadsheet, not in the app's
// own database — the older Apps Script forms still write to it too. See
// lib/imsSheet.js for the layout and the row-identity rules.

// Slab block/release alerts go to the inventory WhatsApp *group*, not a single
// number. formatNumber() passes a …@g.us JID through untouched.
const NOTIFY = () => process.env.INVENTORY_NOTIFY || '918050005533-1494226049@g.us';

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const rows = await listSlabs();
    return NextResponse.json(rows.map(publicSlab));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const body = await req.json();
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length) return NextResponse.json({ error: 'No entries' }, { status: 400 });

    // One Uniquekey per Inward submission, matching the old form. The client
    // posts in small batches, so it passes the key back for batches 2..n.
    const lotKey = String(body.lotKey || '').trim() || await nextLotKey();
    const createdAt = new Date().toISOString();

    // Photos become shareable Drive links: that is what the sheet has always
    // held, and a cell is capped at 50,000 characters so base64 is not an
    // option here.
    const rows = [];
    for (const e of entries) {
      const slabPhoto = await maybeUploadToDriveWithLink(e.slabPhoto, 'slab-photo');
      rows.push({
        createdAt, key: lotKey, slab: e.slab || '', block: e.block || '-',
        material: e.material || '', thickness: e.thickness || '',
        sizeL: e.sizeL || '', sizeW: e.sizeW || '', sft: e.sft || '',
        slabPhoto: slabPhoto || '', status: e.status || 'Available', updatedAt: '',
        orderNo: e.orderNo || '', client: e.client || '', area: e.area || '',
        cutting: e.cutting || '', cuttingReason: e.cuttingReason || '',
        cuttingSizeL: e.cuttingSizeL || '', cuttingSizeW: e.cuttingSizeW || '',
        remarks: e.remarks || '',
      });
    }

    const count = await appendSlabs(rows);
    return NextResponse.json({ ok: true, count, lotKey }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Only status/order/client/area move in the multi-select "Add Slabs" path;
// per-slab detail edits (size, photo, …) come through the single-id path.
const BULK_FIELDS = ['status', 'orderNo', 'client', 'area'];
const EDIT_FIELDS = ['slab', 'material', 'thickness', 'sizeL', 'sizeW', 'sft', 'slabPhoto',
  'status', 'orderNo', 'client', 'area', 'remarks'];

async function notifyStatus(prev, next) {
  if (!isWhatsappConfigured()) return;
  try {
    if (prev.status !== 'Blocked' && next.status === 'Blocked') {
      await sendWhatsApp(NOTIFY(), slabBlockedMessage(next));
    } else if (prev.status === 'Blocked' && next.status === 'Available') {
      await sendWhatsApp(NOTIFY(), slabReleasedMessage(next));
    }
  } catch (err) { console.error('[inventory notify]', err.message); }
}

export async function PATCH(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const e = await req.json();
    const ids = Array.isArray(e.ids) && e.ids.length ? e.ids : (e.id ? [e.id] : []);
    if (!ids.length) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const fields = Array.isArray(e.ids) && e.ids.length ? BULK_FIELDS : EDIT_FIELDS;
    const updatedAt = new Date().toISOString();
    const updates = [];
    const notify = [];

    for (const id of ids) {
      const cur = await resolveRow(id);
      if (!cur) continue;
      const prev = { ...cur };
      const next = { ...cur, updatedAt };
      for (const f of fields) if (e[f] !== undefined && e[f] !== null) next[f] = e[f];
      // A photo edit may arrive as a fresh base64 capture — park it in Drive
      // before it ever reaches a cell.
      if (fields.includes('slabPhoto') && e.slabPhoto !== undefined) {
        next.slabPhoto = await maybeUploadToDriveWithLink(e.slabPhoto, 'slab-photo');
      }
      updates.push({ row: cur.__row, obj: next });
      notify.push([prev, next]);
    }

    if (!updates.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await writeRows(updates);
    for (const [prev, next] of notify) await notifyStatus(prev, next);

    return NextResponse.json({ ok: true, count: updates.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const cur = await resolveRow(id);
    if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await deleteRow(cur.__row);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

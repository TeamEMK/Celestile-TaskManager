import { requireUser, json, fail } from '@/lib/api';
import { findByOrder } from '@/lib/imsSheet';
import { filterByArea } from '@/lib/areaMatch';

// Slabs blocked to one area of an order — what a "Thickness per Piece" field
// on an FMS step lists, one thickness box per slab. Open to any signed-in
// user: FMS doers in production don't have Inventory access, and all this
// hands back is slab numbers and their billed thickness.
//
// Used slabs count too: Step 2's cutting submit marks a slab Used, and the
// production steps that measure thickness come after it.
export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const url = new URL(req.url);
    const orderNo = (url.searchParams.get('orderNo') || '').trim();
    const area = (url.searchParams.get('area') || '').trim();
    if (!orderNo) return fail('orderNo required');
    const live = (await findByOrder(orderNo)).filter((r) => ['Blocked', 'Step2', 'Used'].includes(String(r.status)));
    const slabs = filterByArea(live, area)
      .map((r) => ({ slab: String(r.slab || ''), material: r.material || '', thickness: r.thickness || '', area: r.area || '' }))
      .sort((a, b) => a.slab.localeCompare(b.slab, undefined, { numeric: true }));
    return json({ orderNo, area, slabs });
  } catch (err) {
    console.error('[fms blocked-slabs]', err.message);
    return fail('Could not read the stock list', 500);
  }
}

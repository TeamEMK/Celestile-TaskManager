import { NextResponse } from 'next/server';
import { timingSafeEqual } from '@/lib/api';
import { intakePdfSig, readIntakePdfRecord, generateIntakePdf } from '@/lib/intakePdf';

export const dynamic = 'force-dynamic';

// The submitted-intake-form PDF sent to WhatsApp (lib/intakePdf.js). Maytapi
// fetches it with no session, so the link carries an HMAC signature:
//   /api/fms-intake-pdf?id=<IPDF…>&sig=<intakePdfSig(id)>
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';
    const sig = url.searchParams.get('sig') || '';
    if (!id || !timingSafeEqual(sig, intakePdfSig(id)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rec = await readIntakePdfRecord(id);
    if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const pdf = await generateIntakePdf(rec);
    const name = `${String(rec.orderNo || 'Order').replace(/[^\w-]+/g, '_')}-form.pdf`;
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[fms-intake pdf]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

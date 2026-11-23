import { NextResponse } from 'next/server';
import { timingSafeEqual, currentUserIsAdmin } from '@/lib/api';
import {
  dispatchReportSig, loadDispatchRows, generateDispatchReportPdf, sendDispatchReport, lastWeek, lastMonth,
} from '@/lib/dispatchReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Dispatch report PDF (lib/dispatchReport.js).
//   ?branch=Hyderabad&from=YYYY-MM-DD&to=YYYY-MM-DD&sig=…  — what Maytapi
//     fetches to attach to the WhatsApp message (no session, so signed).
//   An admin, signed in, may open it without sig to preview; ?period=week /
//     month fills from/to with last week / last month; &send=1 sends it now.
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const branch = url.searchParams.get('branch') || 'Hyderabad';
    let from = url.searchParams.get('from') || '', to = url.searchParams.get('to') || '';
    const period = url.searchParams.get('period');
    if (period === 'week') ({ from, to } = lastWeek());
    if (period === 'month') ({ from, to } = lastMonth());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !/^(Hyderabad|Bangalore)$/.test(branch))
      return NextResponse.json({ error: 'branch, from, to (YYYY-MM-DD) required' }, { status: 400 });
    const sig = url.searchParams.get('sig') || '';
    const signed = sig && timingSafeEqual(sig, dispatchReportSig(branch, from, to));
    if (!signed && !(await currentUserIsAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (url.searchParams.get('send') === '1') {
      if (signed) return NextResponse.json({ error: 'Sign in as admin to send' }, { status: 401 });
      return NextResponse.json(await sendDispatchReport({ from, to, kind: period === 'month' ? 'Monthly' : 'Weekly' }));
    }
    const rows = await loadDispatchRows({ branch, from, to });
    const pdf = await generateDispatchReportPdf({ branch, from, to, rows });
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${branch}-Dispatch-${from}-to-${to}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[dispatch-report-pdf]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

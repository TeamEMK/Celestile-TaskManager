import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { timingSafeEqual } from '@/lib/api';
import { istDateStr, toEntry, salesMonthSummary, eaReportSig } from '@/lib/dailyReport';
import { generateEaReportPdf } from '@/lib/ea-report-pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Public PDF of one day's EA report (Walk-in + Payments tables, Excel-style).
// No session auth — Maytapi fetches this URL to attach the document to the
// WhatsApp message — so the link must carry a valid HMAC signature instead:
//   /api/ea-report-pdf?date=YYYY-MM-DD&sig=<eaReportSig(date)>
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get('date') || istDateStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return NextResponse.json({ error: 'bad date' }, { status: 400 });
    const sig = url.searchParams.get('sig') || '';
    if (!timingSafeEqual(sig, eaReportSig(date)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureSchema();
    // Plain SELECT + JS filter — the Sheets SQL engine has no DATE()/LIKE.
    const [all] = await pool.query('SELECT * FROM daily_tasks');
    const rows = (all || []).filter((r) => String(r.entry_date || '').slice(0, 10) === date);
    const walkins  = rows.filter((r) => r.department === 'Walk-in').map(toEntry);
    const payments = rows.filter((r) => r.department === 'Sales Payment').map(toEntry);
    const sales = await salesMonthSummary(date.slice(0, 7));

    const pdf = await generateEaReportPdf({ dateStr: date, walkins, payments, sales });
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Daily-Report-${date}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[ea-report pdf]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

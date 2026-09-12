import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';
import { salesMonthSummary, eaReportSig } from '@/lib/dailyReport';

export const dynamic = 'force-dynamic';

// Month position for the EA Payments form (see salesMonthSummary in
// lib/dailyReport.js). Two numbers are typed here, both per month in
// app_config: the monthly target (sales_target_<YYYY-MM>, carried forward
// from the previous month when unset) and the amount received before
// entries moved into the app (sales_opening_<YYYY-MM>). Everything else —
// today's total, till-date received, balance target — is computed.

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;

function monthParam(v) {
  return MONTH_RE.test(v || '') ? v : undefined; // undefined → current IST month
}
function dateParam(v) {
  return DATE_RE.test(v || '') ? v : undefined;  // undefined → IST today
}

// Same signed link Maytapi is given — lets the form open the day's PDF.
function withPdf(summary) {
  return { ...summary, pdfUrl: `/api/ea-report-pdf?date=${summary.date}&sig=${eaReportSig(summary.date)}` };
}

// GET ?month=&date= → { month, date, today, entered, opening, received,
//                      target, targetFrom, carried, balanceTarget, pdfUrl }
export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const q = new URL(req.url).searchParams;
    const date = dateParam(q.get('date'));
    const month = monthParam(q.get('month')) || (date ? date.slice(0, 7) : undefined);
    return NextResponse.json(withPdf(await salesMonthSummary(month, date)));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST { target?, opening?, month?, date? } → saves whichever of target /
// opening is present for the month, returns the fresh summary.
export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    const fields = {};
    for (const [k, key] of [['target', 'sales_target'], ['opening', 'sales_opening']]) {
      if (body[k] === undefined || body[k] === null || body[k] === '') continue;
      const n = Number(body[k]);
      if (!Number.isFinite(n) || n < 0)
        return NextResponse.json({ error: `${k} must be a number ≥ 0` }, { status: 400 });
      fields[key] = n;
    }
    if (!Object.keys(fields).length)
      return NextResponse.json({ error: 'nothing to save' }, { status: 400 });

    const date = dateParam(body.date);
    const month = monthParam(body.month) || (date ? date.slice(0, 7) : undefined);
    const resolved = (await salesMonthSummary(month, date)).month; // resolves the default month
    for (const [key, n] of Object.entries(fields)) {
      await pool.query(
        'INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [`${key}_${resolved}`, String(n), String(n)]);
    }
    return NextResponse.json(withPdf(await salesMonthSummary(resolved, date)));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';
import { salesMonthSummary } from '@/lib/dailyReport';

export const dynamic = 'force-dynamic';

// Monthly sales target for the EA Payments form. Till Date Received Total is
// computed (this month's Adv Paid summed), the target is the one number a
// person sets — stored in app_config as sales_target_<YYYY-MM>, so each month
// starts fresh at 0 without anyone having to reset anything.

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthParam(req) {
  const m = new URL(req.url).searchParams.get('month') || '';
  return MONTH_RE.test(m) ? m : undefined; // undefined → current IST month
}

// GET → { month, target, received, balanceTarget }
export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    return NextResponse.json(await salesMonthSummary(monthParam(req)));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST { target, month? } → sets the month's target, returns the fresh summary.
export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    const target = Number(body.target);
    if (!Number.isFinite(target) || target < 0)
      return NextResponse.json({ error: 'target must be a number ≥ 0' }, { status: 400 });
    const month = MONTH_RE.test(body.month || '') ? body.month : undefined;

    const summary = await salesMonthSummary(month); // also resolves the default month
    await pool.query(
      'INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      [`sales_target_${summary.month}`, String(target), String(target)]);
    return NextResponse.json({
      ...summary, target, balanceTarget: target - summary.received,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

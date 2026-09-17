import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';
import { receivedAmount } from '@/lib/dailyReport';

export const dynamic = 'force-dynamic';

// What the Payments form needs the moment an order number is typed: the
// order's value from its earlier Payments rows and everything received on it
// so far (sum of Recd Today across those rows — receivedAmount() covers the
// rows from before that column existed). The EA does not add that up by
// hand: Adv Paid is filled from `received`, Bal = Order Value − Adv Paid.
//
// GET ?orderNumber=… → { orderNumber, entries, orderValue, received }
// Plain SELECT + JS filter — the Sheets SQL engine has no LOWER()/LIKE.
export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const raw = (new URL(req.url).searchParams.get('orderNumber') || '').trim();
    const key = raw.toLowerCase();
    if (!key) return NextResponse.json({ error: 'orderNumber required' }, { status: 400 });

    await ensureSchema();
    const [all] = await pool.query(
      'SELECT entry_date, created_at, department, order_number, order_value, adv_paid, received_today FROM daily_tasks');
    const rows = (all || [])
      .filter((r) => r.department === 'Sales Payment'
        && String(r.order_number || '').trim().toLowerCase() === key)
      .sort((a, b) => String(a.entry_date || '').localeCompare(String(b.entry_date || ''))
        || String(a.created_at || '').localeCompare(String(b.created_at || '')));

    const received = rows.reduce((s, r) => s + receivedAmount(r), 0);
    const last = rows[rows.length - 1];
    return NextResponse.json({
      orderNumber: raw,
      entries: rows.length,
      orderValue: last ? (Number(last.order_value) || 0) : 0,
      received,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

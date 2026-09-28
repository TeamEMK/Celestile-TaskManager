import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireUserCtx } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { getUserBalances } from '@/lib/leaves';

// Leave balance for the current year (or ?year=), for the caller or, for an
// admin, any ?userId= — same visibility rule as GET /api/leaves.
export async function GET(req) {
  const { gate, user: caller } = await requireUserCtx(); if (gate) return gate;
  try {
    await ensureSchema();
    const url = new URL(req.url);
    let userId = url.searchParams.get('userId');
    if (!userId || !isAdminRoles(caller.roles)) userId = caller.id;
    const year = url.searchParams.get('year') || String(new Date().getFullYear());
    const balances = await getUserBalances(userId, year);
    return NextResponse.json({ userId, year, balances });
  } catch (err) {
    console.error('[leaves/balance GET]', err.message);
    return NextResponse.json({ error: 'Failed to load leave balance' }, { status: 500 });
  }
}

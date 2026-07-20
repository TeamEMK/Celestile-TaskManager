import { NextResponse } from 'next/server';
import { requireUser, currentUser } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { getMyFmsPendingRows } from '@/lib/fmsSheet';

// Pending FMS rows across every sheet/step visible to the caller — powers
// the Dashboard FMS tab and the All-Tasks FMS tab (client-side refresh path;
// initial server-render calls getMyFmsPendingRows directly).
export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const user = await currentUser();
    const rows = await getMyFmsPendingRows({ userId: user.id, userName: user.name, isAdmin: isAdminRoles(user.roles) });
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

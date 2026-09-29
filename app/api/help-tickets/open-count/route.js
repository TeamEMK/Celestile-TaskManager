import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { openTicketCount } from '@/lib/helpTickets';

// Sidebar badge: unresolved tickets this user can see — all of them for an
// admin, their own for everyone else. Polled on every page, so it fails quiet
// (0) rather than lighting up an error the user can do nothing about, exactly
// like /api/approvals/pending-count.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ count: 0 });
  try {
    const count = await openTicketCount({ viewerId: user.id, isAdmin: isAdminRoles(user.roles) });
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}

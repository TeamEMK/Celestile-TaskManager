import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdminRoles } from '@/lib/pages';
import HelpTicketsClient from './HelpTicketsClient';

export const dynamic = 'force-dynamic';

export default async function HelpTicketsPage() {
  const session = await getServerSession(authOptions);

  // isAdmin only decides what the page draws (the assignee column filter, the
  // "everyone's tickets" wording). What actually comes back is decided by the
  // API against the session — see lib/helpTickets.js.
  return (
    <HelpTicketsClient
      userId={session?.user?.id || ''}
      isAdmin={isAdminRoles(session?.user?.roles)}
    />
  );
}

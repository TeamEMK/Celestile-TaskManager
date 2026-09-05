import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import LeaveTrackerClient from './LeaveTrackerClient';
import { isAdminRoles } from '@/lib/pages';

export const dynamic = 'force-dynamic';

export default async function LeaveTrackerPage() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles || [];
  const canApprove = isAdminRoles(roles);

  return (
    <LeaveTrackerClient
      userId={session?.user?.id || ''}
      userName={session?.user?.name || ''}
      canApprove={canApprove}
    />
  );
}

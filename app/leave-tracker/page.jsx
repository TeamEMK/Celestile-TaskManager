import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import LeaveTrackerClient from './LeaveTrackerClient';

export const dynamic = 'force-dynamic';

export default async function LeaveTrackerPage() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles || [];
  const canApprove = roles.includes('Admin') || roles.includes('HOD');

  return (
    <LeaveTrackerClient
      userId={session?.user?.id || ''}
      userName={session?.user?.name || ''}
      canApprove={canApprove}
    />
  );
}

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import DailyReportsClient from './DailyReportsClient';
import { isAdminRoles } from '@/lib/pages';

export const dynamic = 'force-dynamic';

export default async function DailyReportsPage() {
  const session = await getServerSession(authOptions);
  const roles   = session?.user?.roles || [];
  const isAdmin = isAdminRoles(roles);
  return <DailyReportsClient isAdmin={!!isAdmin} />;
}

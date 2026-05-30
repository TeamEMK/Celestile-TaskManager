import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import DailyReportsClient from './DailyReportsClient';

export const dynamic = 'force-dynamic';

export default async function DailyReportsPage() {
  const session = await getServerSession(authOptions);
  const roles   = session?.user?.roles || [];
  const isAdmin = roles.includes('Admin') || roles.includes('HOD');
  return <DailyReportsClient isAdmin={!!isAdmin} />;
}

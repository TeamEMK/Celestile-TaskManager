import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import DailyReportsClient from './DailyReportsClient';

export const dynamic = 'force-dynamic';

export default async function DailyReportsPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.roles?.includes('Admin');
  return <DailyReportsClient isAdmin={!!isAdmin} />;
}

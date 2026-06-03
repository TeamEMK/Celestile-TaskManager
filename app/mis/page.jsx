import MISClient from './MISClient';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function MISPage({ searchParams }) {
  const session = await getServerSession(authOptions);
  const roles   = session?.user?.roles || [];
  const rolesArr = Array.isArray(roles) ? roles : String(roles).split(',').map(r => r.trim());
  const isAdmin  = rolesArr.includes('Admin') || rolesArr.includes('HOD');
  if (!isAdmin) redirect('/');

  const sp   = await searchParams;
  const type = sp?.type || 'Delegation MIS';

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const fmt = (d) => d.toISOString().slice(0, 10);

  return (
    <MISClient
      initialRows={[]} initialSummary={{}}
      initialStart={fmt(weekAgo)} initialEnd={fmt(today)} initialType={type}
    />
  );
}

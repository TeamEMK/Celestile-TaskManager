import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readStore, computeDashboard, computePerformance } from '@/lib/store';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.roles?.includes('Admin');
  const currentUserId = session?.user?.id;

  const store = await readStore();
  
  // Admin ko sab dikhao, User ko sirf apne tasks
  const filteredStore = isAdmin ? store : {
    ...store,
    delegations: store.delegations.filter(d => d.doerId === currentUserId),
    fms: store.fms.filter(f => f.doer === session?.user?.name),
  };

  const data = computeDashboard(filteredStore);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const performance = computePerformance(store, from.toISOString(), to.toISOString());

  return (
    <DashboardClient
      data={data}
      performance={performance}
      holidays={store.holidays || []}
      users={store.users || []}
      isAdmin={isAdmin}
    />
  );
}
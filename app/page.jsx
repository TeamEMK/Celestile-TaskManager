import { readStore, computeDashboard, computePerformance } from '@/lib/store';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const store = await readStore();
  const data = computeDashboard(store);
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
    />
  );
}

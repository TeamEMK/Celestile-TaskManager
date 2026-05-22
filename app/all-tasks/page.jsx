import { readStore } from '@/lib/store';
import AllTasksClient from './AllTasksClient';

export const dynamic = 'force-dynamic';

export default async function AllTasksPage() {
  const store = await readStore();
  // Group delegations by doer
  const byDoer = {};
  (store.users || []).forEach((u) => {
    byDoer[u.name] = { doer: u.name, doerId: u.id, tasks: [] };
  });
  (store.delegations || []).forEach((d) => {
    if (!byDoer[d.doer]) byDoer[d.doer] = { doer: d.doer, doerId: d.doerId, tasks: [] };
    byDoer[d.doer].tasks.push(d);
  });
  // Only doers who have at least one task
  const grouped = Object.values(byDoer).filter((g) => g.tasks.length > 0);
  return <AllTasksClient grouped={grouped} users={store.users || []} />;
}

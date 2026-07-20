import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readStore, computeDashboard, computePerformance, computePendingApprovals } from '@/lib/store';
import { pool } from '@/lib/db';
import { getMyFmsPendingRows } from '@/lib/fmsSheet';
import { FMS_ENABLED } from '@/lib/config';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session       = await getServerSession(authOptions);
  const isAdmin       = session?.user?.roles?.includes('Admin') || session?.user?.roles?.includes('HOD');
  const currentUserId = session?.user?.id;
  const currentName   = session?.user?.name;

  const [store, completions] = await Promise.all([
    readStore(),
    pool.query('SELECT master_id FROM checklist_completions WHERE date = CURDATE()')
      .then(([rows]) => rows).catch(() => []),
  ]);

  const completedToday = new Set(completions.map((c) => c.master_id));

  const storeWithCompletions = {
    ...store,
    masters: (store.masters || []).filter((m) => !completedToday.has(m.id)),
  };

  const filteredStore = isAdmin ? storeWithCompletions : {
    ...storeWithCompletions,
    delegations: storeWithCompletions.delegations.filter((d) =>
      d.doerId === currentUserId ||
      d.doer === currentName
    ),
    masters:     storeWithCompletions.masters.filter((m) => m.assignedTo === currentName),
  };

  const data = computeDashboard(filteredStore);
  const to   = new Date();
  const from = new Date(); from.setDate(from.getDate() - 30);
  const performance = computePerformance(store, from.toISOString(), to.toISOString());
  const pendingApprovals = computePendingApprovals(store, { currentUserId });

  if (FMS_ENABLED) {
    const fmsTasks = await getMyFmsPendingRows({ userId: currentUserId, userName: currentName, isAdmin })
      .catch(() => []);
    data.total   += fmsTasks.length;
    data.pending += fmsTasks.length;
    data.pendingTasks = [...data.pendingTasks, ...fmsTasks]
      .sort((a, b) => new Date(b.createdAt || b.date || b.dueDate) - new Date(a.createdAt || a.date || a.dueDate))
      .slice(0, 50);
  }

  return (
    <DashboardClient
      data={data}
      performance={performance}
      pendingApprovals={pendingApprovals}
      holidays={store.holidays || []}
      users={store.users || []}
      isAdmin={isAdmin}
      userName={currentName || ''}
    />
  );
}

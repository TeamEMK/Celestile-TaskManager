import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readStore, computeDashboard, computePerformance } from '@/lib/store';
import { neon } from '@neondatabase/serverless';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL);

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const isAdmin      = session?.user?.roles?.includes('Admin');
  const currentUserId = session?.user?.id;
  const currentName   = session?.user?.name;

  const [store, completions] = await Promise.all([
    readStore(),
    // Aaj ke completed checklist master IDs fetch karo
    sql`SELECT master_id FROM checklist_completions WHERE date = CURRENT_DATE`.catch(() => []),
  ]);

  const completedToday = new Set(completions.map((c) => c.master_id));

  // Masters mein se aaj ke complete hue hataao taaki pending list mein na aayein
  const storeWithCompletions = {
    ...store,
    masters: (store.masters || []).filter((m) => !completedToday.has(m.id)),
  };

  const filteredStore = isAdmin ? storeWithCompletions : {
    ...storeWithCompletions,
    delegations: storeWithCompletions.delegations.filter((d) => d.doerId === currentUserId),
    masters:     storeWithCompletions.masters.filter((m) => m.assignedTo === currentName),
    fms:         (storeWithCompletions.fms || []).filter((f) => f.doer === currentName),
  };

  const data = computeDashboard(filteredStore);
  const to   = new Date();
  const from = new Date(); from.setDate(from.getDate() - 30);
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

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readStore, TASK_TYPES, SOFTWARES } from '@/lib/store';
import DailyTaskClient from './DailyTaskClient';

export const dynamic = 'force-dynamic';

export default async function DailyTaskPage() {
  const session = await getServerSession(authOptions);
  const store = await readStore();

  // Unique client names from existing clients + delegations (for the dropdown)
  const clients = Array.from(
    new Set([
      ...(store.clients || []).map((c) => c.name),
      ...(store.delegations || []).map((d) => d.client),
    ].filter(Boolean))
  ).sort();

  return (
    <DailyTaskClient
      doerId={session?.user?.id || ''}
      doer={session?.user?.name || ''}
      clients={clients}
      taskTypes={TASK_TYPES}
      softwares={SOFTWARES}
    />
  );
}

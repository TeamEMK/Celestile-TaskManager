import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { buildFmsPendingTasks } from '@/lib/fms';
import { FMS_ENABLED } from '@/lib/config';
import FmsTaskClient from './FmsTaskClient';

export const dynamic = 'force-dynamic';

export default async function FmsTaskPage() {
  const session = await getServerSession(authOptions);
  const currentName = session?.user?.name || '';

  const allTasks = FMS_ENABLED ? await buildFmsPendingTasks() : [];
  const myTasks = allTasks.filter((t) => t.doer === currentName);

  return <FmsTaskClient tasks={myTasks} />;
}

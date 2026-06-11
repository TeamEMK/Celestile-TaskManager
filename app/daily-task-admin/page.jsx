import { requireAdmin } from '@/lib/guards';
import DailyTaskAdminClient from './DailyTaskAdminClient';

export const dynamic = 'force-dynamic';

export default async function DailyTaskAdminPage() {
  await requireAdmin();
  return <DailyTaskAdminClient />;
}

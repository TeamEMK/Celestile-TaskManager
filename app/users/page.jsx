import { readStore, DEPARTMENTS } from '@/lib/store';
import { requireAdmin } from '@/lib/guards';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  await requireAdmin();
  const store = await readStore();
  return <UsersClient users={store.users || []} departments={DEPARTMENTS} />;
}

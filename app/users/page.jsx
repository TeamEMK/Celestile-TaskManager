import { readStore, DEPARTMENTS } from '@/lib/store';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const store = await readStore();
  return <UsersClient users={store.users || []} departments={DEPARTMENTS} />;
}

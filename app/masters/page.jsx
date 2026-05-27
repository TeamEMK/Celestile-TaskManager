import { readStore } from '@/lib/store';
import MastersClient from './MastersClient';

export const dynamic = 'force-dynamic';

export default async function MastersPage() {
  const store = await readStore();
  return <MastersClient masters={store.masters || []} users={store.users || []} />;
}
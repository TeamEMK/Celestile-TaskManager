import { neon } from '@neondatabase/serverless';
import MastersClient from './MastersClient';
import { readStore } from '@/lib/store';
import { requireAdmin } from '@/lib/guards';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL);

export default async function MastersPage() {
  await requireAdmin();
  const [masters, store] = await Promise.all([
    sql`SELECT id, task, assigned_to as "assignedTo", frequency, created_at as "createdAt" FROM masters ORDER BY created_at DESC`,
    readStore(),
  ]);
  return <MastersClient masters={masters} users={store.users || []} />;
} 
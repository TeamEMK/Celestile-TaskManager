import MastersClient from './MastersClient';
import { readStore } from '@/lib/store';
import { requireAdmin } from '@/lib/guards';
import { pool, ensureSchema } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function MastersPage() {
  await requireAdmin();
  await ensureSchema();

  const [[masters], store] = await Promise.all([
    pool.query('SELECT id, task, assigned_to AS assignedTo, frequency, created_at AS createdAt FROM masters ORDER BY created_at DESC'),
    readStore(),
  ]);

  return <MastersClient masters={masters} users={store.users || []} />;
}

import { requireAdmin } from '@/lib/guards';
import AccessClient from './AccessClient';

export const dynamic = 'force-dynamic';

export default async function AccessPage() {
  await requireAdmin();
  return <AccessClient />;
}

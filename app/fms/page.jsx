import { readStore, FMS_STEPS } from '@/lib/store';
import FMSClient from './FMSClient';

export const dynamic = 'force-dynamic';

export default async function FMSPage() {
  const store = await readStore();
  return <FMSClient rows={store.fms || []} steps={FMS_STEPS} />;
}

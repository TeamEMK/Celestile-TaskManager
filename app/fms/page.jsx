import { readStore, FMS_STEPS } from '@/lib/store';
import { FMS_ENABLED } from '@/lib/config';
import { redirect } from 'next/navigation';
import FMSClient from './FMSClient';

export const dynamic = 'force-dynamic';

export default async function FMSPage() {
  if (!FMS_ENABLED) redirect('/');
  const store = await readStore();
  return <FMSClient rows={store.fms || []} steps={FMS_STEPS} />;
}
import { requireUser } from '@/lib/guards';
import FMSClient from './FMSClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'FMS — Celestile' };

export default async function FMSPage() {
  await requireUser();
  return <FMSClient />;
}

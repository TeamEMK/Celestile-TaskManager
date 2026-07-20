import { requireUser } from '@/lib/guards';
import FmsTaskClient from './FmsTaskClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'FMS Task — Celestile' };

export default async function FmsTaskPage() {
  await requireUser();
  return <FmsTaskClient />;
}

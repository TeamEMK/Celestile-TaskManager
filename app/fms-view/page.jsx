import { requireUser } from '@/lib/guards';
import FmsViewListClient from './FmsViewListClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'FMS Tracker — Celestile' };

export default async function FmsViewPage() {
  await requireUser();
  return <FmsViewListClient />;
}

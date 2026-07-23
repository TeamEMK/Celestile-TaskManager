import { requireUser } from '@/lib/guards';
import FmsDetailClient from './FmsDetailClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'FMS Tracker — Celestile' };

export default async function FmsViewDetailPage({ params }) {
  await requireUser();
  const { id } = await params;
  return <FmsDetailClient fmsId={id} />;
}

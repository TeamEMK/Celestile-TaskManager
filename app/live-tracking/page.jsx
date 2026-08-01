import { requireUser } from '@/lib/guards';
import LiveTrackingClient from './LiveTrackingClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Live Tracking — Celestile' };

export default async function LiveTrackingPage() {
  await requireUser();
  return <LiveTrackingClient />;
}

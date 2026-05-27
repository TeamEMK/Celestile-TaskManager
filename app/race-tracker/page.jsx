import { readStore } from '@/lib/store';
import { RACE_TRACKER_ENABLED } from '@/lib/config';
import { redirect } from 'next/navigation';
import RaceTrackerClient from './RaceTrackerClient';

export const dynamic = 'force-dynamic';

export default async function RaceTrackerPage() {
  if (!RACE_TRACKER_ENABLED) redirect('/');
  const store = await readStore();
  return (
    <RaceTrackerClient
      delegations={store.delegations || []}
      users={store.users || []}
    />
  );
}
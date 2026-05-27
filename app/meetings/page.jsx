import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readStore } from '@/lib/store';
import MeetingsClient from './MeetingsClient';

export const dynamic = 'force-dynamic';

export default async function MeetingsPage() {
  const session = await getServerSession(authOptions);
  const store = await readStore();

  return (
    <MeetingsClient
      createdBy={session?.user?.name || ''}
      holidays={store.holidays || []}
      users={(store.users || []).map((u) => u.name)}
    />
  );
}

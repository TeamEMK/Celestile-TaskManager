import { readStore } from '@/lib/store';
import ProfileClient from './ProfileClient';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const store = await readStore();
  const profile = store.profile || {};
  const me = (store.users || []).find((u) => u.id === profile.userId) || (store.users || [])[0];
  return <ProfileClient me={me} notificationEmail={profile.notificationEmail || ''} />;
}

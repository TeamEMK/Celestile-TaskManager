import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import ClientMasterClient from './ClientMasterClient';

export const dynamic = 'force-dynamic';

export default async function ClientMasterPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.roles?.includes('Admin');
  return <ClientMasterClient canEdit={!!isAdmin} />;
}

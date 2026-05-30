import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { requireAdmin } from '@/lib/guards';
import ClientMasterClient from './ClientMasterClient';

export const dynamic = 'force-dynamic';

export default async function ClientMasterPage() {
  await requireAdmin();
  const session = await getServerSession(authOptions);
  const roles   = session?.user?.roles || [];
  const isAdmin = roles.includes('Admin') || roles.includes('HOD');
  return <ClientMasterClient canEdit={!!isAdmin} />;
}

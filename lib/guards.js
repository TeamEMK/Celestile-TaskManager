import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

/**
 * Server-side guard. Call at the top of any admin-only server page:
 *
 *   export default async function Page() {
 *     await requireAdmin();
 *     ...
 *   }
 *
 * Non-admins (and signed-out users) are redirected to the dashboard.
 * Returns the session for convenience.
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const roles = session?.user?.roles || [];
  const isAdmin = roles.includes('Admin') || roles.includes('HOD');
  if (!isAdmin) redirect('/');
  return session;
}

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  return session;
}
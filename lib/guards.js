import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

// A session stamped with an error ('ForceLogout' — account deleted, or an
// admin pressed force-logout) is not a session. See the same rule in
// lib/api.js currentUser(): the JWT stays valid for its full life, so the
// server has to refuse it rather than trusting the browser to sign itself out.
async function liveSession() {
  const session = await getServerSession(authOptions);
  if (!session || session.error) return null;
  return session;
}

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
  const session = await liveSession();
  const roles = session?.user?.roles || [];
  const isAdmin = roles.includes('Admin') || roles.includes('HOD');
  if (!isAdmin) redirect('/');
  return session;
}

export async function requireUser() {
  const session = await liveSession();
  if (!session?.user) redirect('/login');
  return session;
}

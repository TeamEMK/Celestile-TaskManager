import RevisionReportClient from './RevisionReportClient';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function RevisionReportPage() {
  const session = await getServerSession(authOptions);
  const roles   = session?.user?.roles || [];
  const rolesArr = Array.isArray(roles) ? roles : String(roles).split(',').map(r => r.trim());
  if (!rolesArr.includes('Admin') && !rolesArr.includes('HOD')) redirect('/');
  return <RevisionReportClient />;
}

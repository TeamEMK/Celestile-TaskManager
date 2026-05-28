import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { neon } from '@neondatabase/serverless';
import ProfileClient from './ProfileClient';

const sql = neon(process.env.DATABASE_URL);
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;

  let me = null;
  if (id) {
    const rows = await sql`
      SELECT id, name, email, phone, department, roles,
             notification_email AS "notificationEmail"
      FROM users WHERE id = ${id}`;
    me = rows[0] || null;
    if (me && typeof me.roles === 'string') {
      me.roles = me.roles.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  return <ProfileClient me={me} notificationEmail={me?.notificationEmail || ''} />;
}
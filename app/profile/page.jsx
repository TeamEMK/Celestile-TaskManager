import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool, ensureSchema } from '@/lib/db';
import ProfileClient from './ProfileClient';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  await ensureSchema();
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;

  let me = null;
  if (id) {
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, department, roles FROM users WHERE id = ?',
      [id]
    );
    me = rows[0] || null;
    if (me && typeof me.roles === 'string') {
      me.roles = me.roles.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  return <ProfileClient me={me} notificationEmail={me?.notificationEmail || ''} />;
}

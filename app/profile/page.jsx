import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';
import { readStore } from '@/lib/store';
import ProfileClient from './ProfileClient';

export const dynamic = 'force-dynamic';

const hasDB = !!process.env.DB_HOST;

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;

  let me = null;
  let notificationEmail = '';

  if (id) {
    if (hasDB) {
      const [rows, profRows] = await Promise.all([
        pool.query('SELECT id, name, email, phone, department, roles, picture FROM users WHERE id = ?', [id])
          .then(([r]) => r).catch(() => []),
        pool.query('SELECT notification_email FROM profile WHERE user_id = ?', [id])
          .then(([r]) => r).catch(() => []),
      ]);
      me = rows[0] || null;
      if (me && typeof me.roles === 'string')
        me.roles = me.roles.split(',').map((s) => s.trim()).filter(Boolean);
      notificationEmail = profRows[0]?.notification_email || '';
    } else {
      const store = await readStore();
      me = (store.users || []).find((u) => u.id === id) || null;
      notificationEmail = me?.notificationEmail || '';
    }
  }

  // If DB returned nothing, build from session data
  if (!me && session?.user) {
    me = {
      id:         session.user.id,
      name:       session.user.name       || '',
      email:      session.user.email      || '',
      department: session.user.department || '',
      roles:      session.user.roles      || ['User'],
      phone:      session.user.phone      || '',
      picture:    null,
    };
  } else if (me) {
    me.name       = me.name       || session?.user?.name       || '';
    me.phone      = me.phone      || session?.user?.phone      || '';
    me.department = me.department || session?.user?.department || '';
  }

  return <ProfileClient me={me} notificationEmail={notificationEmail} />;
}

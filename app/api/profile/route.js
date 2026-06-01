import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function PATCH(req) {
  try {
    await ensureSchema();
    const session = await getServerSession(authOptions);
    const id = session?.user?.id;
    if (!id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    // Ensure picture column exists
    try { await pool.query('ALTER TABLE users ADD COLUMN picture MEDIUMTEXT DEFAULT NULL'); } catch {}
    // Update core fields without picture first
    await pool.query(
      `UPDATE users SET
        name  = COALESCE(?, name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone)
       WHERE id = ?`,
      [body.name ?? null, body.email ?? null, body.phone ?? null, id]
    );
    // Picture update separately
    if (body.picture !== undefined) {
      await pool.query('UPDATE users SET picture = ? WHERE id = ?', [body.picture, id]);
    }
    if (body.notificationEmail !== undefined) {
      await pool.query(
        `INSERT INTO profile (user_id, notification_email) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE notification_email = ?`,
        [id, body.notificationEmail || '', body.notificationEmail || '']
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

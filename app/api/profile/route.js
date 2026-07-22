import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import bcrypt from 'bcryptjs';
import { maybeUploadToDrive } from '@/lib/googleDrive';

const DEFAULT_PASSWORD = 'India@123';

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
      const picture = await maybeUploadToDrive(body.picture, 'profile-photo');
      await pool.query('UPDATE users SET picture = ? WHERE id = ?', [picture, id]);
    }
    if (body.notificationEmail !== undefined) {
      await pool.query(
        `INSERT INTO profile (user_id, notification_email) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE notification_email = ?`,
        [id, body.notificationEmail || '', body.notificationEmail || '']
      );
    }

    // Password change
    if (body.newPassword) {
      const [[user]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [id]);
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

      const currentOk = !user.password_hash
        ? body.currentPassword === DEFAULT_PASSWORD
        : await bcrypt.compare(body.currentPassword || '', user.password_hash);

      if (!currentOk)
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

      const hash = await bcrypt.hash(body.newPassword, 10);
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

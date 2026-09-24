import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { maybeUploadToDrive } from '@/lib/googleDrive';
import { requireUserCtx } from '@/lib/api';

const DEFAULT_PASSWORD = 'India@123';

export async function PATCH(req) {
  try {
    await ensureSchema();
    // requireUserCtx (not a raw getServerSession read) so a session stamped
    // 'ForceLogout' (account deleted, or an admin pressed force-logout) is
    // refused here too — this route used to skip that check entirely, so a
    // revoked JWT could still be used to change the account's own password.
    // It also applies the "Service Suspended" gate every other guarded route
    // respects.
    const { gate, user: sessionUser } = await requireUserCtx(); if (gate) return gate;
    const id = sessionUser.id;

    const body = await req.json();
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
      // Same minimum the admin-driven "Set Password" flow enforces
      // (app/api/users/set-password/route.js) — this self-service path used
      // to accept a password of any length, including a single character.
      if (String(body.newPassword).length < 6)
        return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });

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
    console.error('[profile PATCH]', err.message);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

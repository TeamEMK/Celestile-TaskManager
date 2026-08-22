import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, ensureSchema } from '@/lib/db';
import { requireDeveloper } from '@/lib/api';
import { nextSeqId } from '@/lib/ids';

/**
 * Bootstrap an admin login on a fresh database.
 *
 *   POST /api/init-admin?secret=<DEVELOPER_SECRET>
 *   { "password": "<optional; generated if omitted>" }
 *
 * Two changes from the old version. It is POST, because a GET that resets the
 * admin password is something a link prefetch or a crawler can trigger on its
 * own. And the password is no longer a constant written in this file — that
 * value was also the hardcoded-admin password in the auth route, so the
 * "known password" was known to everyone with the source. Omit `password` and
 * a random one is generated and returned exactly once.
 */
export async function POST(req) {
  const gate = requireDeveloper(req); if (gate) return gate;
  try {
    await ensureSchema();
    const email = 'admin@celestile.com';

    const body = await req.json().catch(() => ({}));
    const supplied = String(body.password || '');
    if (supplied && supplied.length < 8) {
      return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });
    }
    const password = supplied || crypto.randomBytes(12).toString('base64url');
    const hash = await bcrypt.hash(password, 10);

    const [ex] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (ex.length) {
      await pool.query('UPDATE users SET password_hash = ?, roles = ?, active = 1 WHERE id = ?',
        [hash, 'Admin', ex[0].id]);
    } else {
      // Numeric max across every row — 'ORDER BY id DESC LIMIT 1' sorts ids as
      // strings, so past U999 it sticks and hands out a duplicate. See lib/ids.js.
      const [all] = await pool.query('SELECT id FROM users');
      const id = nextSeqId(all, 'U', 3);
      await pool.query(
        `INSERT INTO users (id, name, email, phone, department, roles, active, password_hash, created_at)
         VALUES (?, ?, ?, '', 'CXO', 'Admin', 1, ?, NOW())`,
        [id, 'Admin', email, hash]
      );
    }
    return NextResponse.json({
      ok: true, email, password,
      note: 'Shown once. Sign in and change it from the Users page.',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

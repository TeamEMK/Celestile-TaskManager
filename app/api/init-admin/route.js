import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool, ensureSchema } from '@/lib/db';

// Bootstrap an admin login on a fresh database.
//   /api/init-admin?secret=<DEVELOPER_SECRET>
// Creates (or resets) admin@celestile.com as an Admin with a known password.
// Use it once after pointing the app at an empty MySQL DB, then add real users
// from the Users page and change this password.
export async function GET(req) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.DEVELOPER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await ensureSchema();
    const email = 'admin@celestile.com';
    const password = 'Celestile@123';
    const hash = await bcrypt.hash(password, 10);

    const [ex] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (ex.length) {
      await pool.query('UPDATE users SET password_hash = ?, roles = ?, active = 1 WHERE id = ?',
        [hash, 'Admin', ex[0].id]);
    } else {
      const [last] = await pool.query('SELECT id FROM users ORDER BY id DESC LIMIT 1');
      const n = last.length ? (parseInt(String(last[0].id).replace(/\D/g, ''), 10) || 0) : 0;
      const id = 'U' + String(n + 1).padStart(3, '0');
      await pool.query(
        `INSERT INTO users (id, name, email, phone, department, roles, active, password_hash, created_at)
         VALUES (?, ?, ?, '', 'CXO', 'Admin', 1, ?, NOW())`,
        [id, 'Admin', email, hash]
      );
    }
    return NextResponse.json({ ok: true, email, password });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

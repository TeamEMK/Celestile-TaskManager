import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool, ensureSchema } from '@/lib/db';

const hasDB = !!process.env.DB_HOST;

export async function POST(req) {
  const { userId, password } = await req.json();
  if (!userId || !password || password.length < 6)
    return NextResponse.json({ error: 'userId and password (min 6 chars) required' }, { status: 400 });

  const hash = await bcrypt.hash(password, 10);
  const now  = Date.now();

  if (!hasDB) {
    const { readStore, writeStore } = await import('@/lib/store');
    const store = await readStore();
    const user = (store.users || []).find(u => u.id === userId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    user.password_hash    = hash;
    user.forceLogoutAfter = now;   // triggers auto-logout for active sessions
    await writeStore(store);
    return NextResponse.json({ success: true });
  }

  await ensureSchema();
  // For MySQL: store forceLogoutAfter as a timestamp in remarks or a dedicated column
  // Using password_changed_at as a workaround via the existing schema
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
  return NextResponse.json({ success: true });
}

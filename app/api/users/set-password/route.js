import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool, ensureSchema } from '@/lib/db';

export async function POST(req) {
  const { userId, password } = await req.json();
  if (!userId || !password || password.length < 6) {
    return NextResponse.json({ error: 'userId and password (min 6 chars) required' }, { status: 400 });
  }
  await ensureSchema();
  const hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
  return NextResponse.json({ success: true });
}

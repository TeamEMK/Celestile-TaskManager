import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool, ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/api';

export async function POST(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { userId, password } = await req.json();
    if (!userId || !password || password.length < 6)
      return NextResponse.json({ error: 'userId and password (min 6 chars) required' }, { status: 400 });

    await ensureSchema();
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
    if (!result.affectedRows)
      return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

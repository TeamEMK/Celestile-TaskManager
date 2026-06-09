import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool, ensureSchema } from '@/lib/db';

export async function GET(req) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.DEVELOPER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await ensureSchema();
    const hash = await bcrypt.hash('Celestile@123', 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, 'U001']);
    return NextResponse.json({ ok: true, email: 'admin@celestile.com', password: 'Celestile@123' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

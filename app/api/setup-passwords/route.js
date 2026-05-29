import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
    const hash = await bcrypt.hash('India@123', 10);

    // Set India@123 for all users (overwrite existing)
    await sql`UPDATE users SET password_hash = ${hash}`;

    const rows = await sql`SELECT COUNT(*) AS c FROM users WHERE password_hash IS NOT NULL`;
    return NextResponse.json({ ok: true, updated: Number(rows[0].c), password: 'India@123' });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

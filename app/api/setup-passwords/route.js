import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';
import { requireDeveloper } from '@/lib/api';

/**
 * One-time bootstrap: give every user the same starting password.
 *
 * This used to be an unauthenticated GET. Anyone who guessed the path could
 * reset EVERY account's password to a value published in this file and then
 * sign in as anyone — /api/* is excluded from the middleware matcher, so it
 * was reachable straight off the internet. It now needs DEVELOPER_SECRET, it
 * has to be armed explicitly per call, and it never invents its own password.
 *
 *   POST /api/setup-passwords?secret=<DEVELOPER_SECRET>
 *   { "password": "<at least 8 chars>", "confirm": "RESET ALL PASSWORDS" }
 *
 * POST, not GET: a bare GET is something a browser prefetch, a link scanner or
 * a crawler can fire on its own.
 */
export async function POST(req) {
  const gate = requireDeveloper(req); if (gate) return gate;
  try {
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!dbUrl) return NextResponse.json({ ok: false, error: 'No Postgres URL configured' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    if (body.confirm !== 'RESET ALL PASSWORDS') {
      return NextResponse.json(
        { ok: false, error: 'Refused: pass {"confirm":"RESET ALL PASSWORDS"} to run this' },
        { status: 400 },
      );
    }
    const password = String(body.password || '');
    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: 'password must be at least 8 characters' }, { status: 400 });
    }

    const sql = neon(dbUrl);
    const hash = await bcrypt.hash(password, 10);
    await sql`UPDATE users SET password_hash = ${hash}`;

    const rows = await sql`SELECT COUNT(*) AS c FROM users WHERE password_hash IS NOT NULL`;
    // The password is what the caller just sent — no need to echo it back.
    return NextResponse.json({ ok: true, updated: Number(rows[0].c) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

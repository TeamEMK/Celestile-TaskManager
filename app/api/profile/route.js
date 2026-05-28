import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const sql = neon(process.env.DATABASE_URL);

export async function PATCH(req) {
  try {
    const session = await getServerSession(authOptions);
    const id = session?.user?.id;
    if (!id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();

    // Update ONLY the logged-in user's own record.
    await sql`
      UPDATE users SET
        name               = COALESCE(${body.name}, name),
        email              = COALESCE(${body.email}, email),
        phone              = COALESCE(${body.phone}, phone),
        notification_email = COALESCE(${body.notificationEmail}, notification_email)
      WHERE id = ${id}`;

    // NOTE: password change is not wired (this schema has no password column).
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
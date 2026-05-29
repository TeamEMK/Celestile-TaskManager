import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function PATCH(req) {
  try {
    await ensureSchema();
    const session = await getServerSession(authOptions);
    const id = session?.user?.id;
    if (!id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    await pool.query(
      `UPDATE users SET
        name  = COALESCE(?, name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone)
       WHERE id = ?`,
      [body.name ?? null, body.email ?? null, body.phone ?? null, id]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

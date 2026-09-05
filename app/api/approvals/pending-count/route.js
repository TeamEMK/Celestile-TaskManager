import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId  = session?.user?.id;
  if (!userId) return NextResponse.json({ count: 0 });

  const roles    = session?.user?.roles || [];
  const rolesArr = Array.isArray(roles) ? roles : String(roles).split(',').map(r => r.trim());
  const isAdmin  = rolesArr.includes('Admin') || rolesArr.includes('HOD');

  try {
    const queries = [
      pool.query(`SELECT COUNT(*) AS cnt FROM delegations WHERE approver_id = ? AND status = 'approval_pending'`, [userId]),
    ];
    if (isAdmin) queries.push(pool.query(`SELECT COUNT(*) AS cnt FROM delegations WHERE status = 'revise_requested'`));
    const results = await Promise.all(queries);
    const count = results.reduce((sum, [rows]) => sum + Number(rows[0]?.cnt || 0), 0);
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}

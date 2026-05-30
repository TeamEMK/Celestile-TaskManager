import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';
import { readStore } from '@/lib/store';

const hasDB = !!process.env.DB_HOST;

export async function GET() {
  const session = await getServerSession(authOptions);
  const roles   = session?.user?.roles || [];
  const rolesArr = Array.isArray(roles) ? roles : String(roles).split(',').map(r => r.trim());
  const isAdmin  = rolesArr.includes('Admin') || rolesArr.includes('HOD');
  if (!isAdmin) return NextResponse.json({ count: 0 });

  try {
    if (hasDB) {
      const [[revise], [tasks]] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS cnt FROM delegations WHERE status = 'revise_requested'`),
        pool.query(`SELECT COUNT(*) AS cnt FROM delegations WHERE approval = 'Approval Required' AND status = 'pending'`),
      ]);
      const count = Number(revise[0]?.cnt || 0) + Number(tasks[0]?.cnt || 0);
      return NextResponse.json({ count });
    }

    const store = await readStore();
    const dels = store.delegations || [];
    const count =
      dels.filter(d => d.status === 'revise_requested').length +
      dels.filter(d => d.approval === 'Approval Required' && d.status === 'pending').length;
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}

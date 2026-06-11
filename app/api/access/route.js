import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { GRANTABLE_PAGES, isAdminRoles, parseAccess } from '@/lib/pages';

const hasDB = !!process.env.DB_HOST;
const rolesFrom = (raw) => Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',').map((r) => r.trim()).filter(Boolean) : ['User'];

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!isAdminRoles(session?.user?.roles)) return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    let users = [];
    if (hasDB) {
      await ensureSchema();
      const [rows] = await pool.query('SELECT id, name, email, roles, access FROM users ORDER BY id');
      users = rows;
    } else {
      const { readStore } = await import('@/lib/store');
      users = (await readStore()).users || [];
    }
    const out = users.map((u) => ({
      id: u.id, name: u.name, email: u.email,
      roles: rolesFrom(u.roles), access: parseAccess(u.access),
    }));
    return NextResponse.json({ pages: GRANTABLE_PAGES, users: out });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const { userId, access } = await req.json();
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    // null = clear (back to default-all); array = explicit grant
    const valid = new Set(GRANTABLE_PAGES.map((p) => p.key));
    const value = access == null ? null : JSON.stringify((access || []).filter((k) => valid.has(k)));

    if (hasDB) {
      await ensureSchema();
      await pool.query('UPDATE users SET access = ? WHERE id = ?', [value, userId]);
    } else {
      const { readStore, writeStore } = await import('@/lib/store');
      const store = await readStore();
      const u = (store.users || []).find((x) => x.id === userId);
      if (u) { u.access = value; await writeStore(store); }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

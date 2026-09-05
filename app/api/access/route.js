import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { GRANTABLE_PAGES, isAdminRoles, parseAccess } from '@/lib/pages';

const rolesFrom = (raw) => Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',').map((r) => r.trim()).filter(Boolean) : ['User'];

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!isAdminRoles(session?.user?.roles)) return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const callerBranch = (session?.user?.branch || '').toLowerCase();
  try {
    await ensureSchema();
    const [users] = callerBranch
      ? await pool.query('SELECT id, name, email, roles, access FROM users WHERE LOWER(branch) = ? ORDER BY id', [callerBranch])
      : await pool.query('SELECT id, name, email, roles, access FROM users ORDER BY id');
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
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const callerBranch = (session?.user?.branch || '').toLowerCase();
  try {
    const { userId, access } = await req.json();
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    // If caller is branch-scoped, reject cross-branch access edits
    if (callerBranch) {
      await ensureSchema();
      const [target] = await pool.query('SELECT branch FROM users WHERE id = ?', [userId]);
      if (target.length && (target[0].branch || '').toLowerCase() !== callerBranch) {
        return NextResponse.json({ error: 'Cannot modify user from another branch' }, { status: 403 });
      }
    }
    // null = clear (back to default-all); array = explicit grant
    const valid = new Set(GRANTABLE_PAGES.map((p) => p.key));
    const value = access == null ? null : JSON.stringify((access || []).filter((k) => valid.has(k)));

    await ensureSchema();
    await pool.query('UPDATE users SET access = ? WHERE id = ?', [value, userId]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

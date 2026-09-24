import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { currentUser } from '@/lib/api';
import { isAccessEnabled } from '@/lib/access';
import { GRANTABLE_PAGES, isAdminRoles, parseAccess } from '@/lib/pages';

const rolesFrom = (raw) => Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',').map((r) => r.trim()).filter(Boolean) : ['User'];

// currentUser() (not a raw getServerSession read) so a session stamped
// 'ForceLogout' is refused here too — same class of gap as /api/profile
// used to have. Also respects the "Service Suspended" kill switch, which
// this route's own requireAdmin() used to skip entirely.
async function requireAdmin() {
  const user = await currentUser();
  if (!user) return { gate: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdminRoles(user.roles)) return { gate: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (!(await isAccessEnabled())) return { gate: NextResponse.json({ error: 'Service suspended' }, { status: 503 }) };
  return { user };
}

export async function GET() {
  const { gate, user: sessionUser } = await requireAdmin(); if (gate) return gate;
  const callerBranch = (sessionUser.branch || '').toLowerCase();
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
    console.error('[access GET]', err.message);
    return NextResponse.json({ error: 'Failed to load access matrix' }, { status: 500 });
  }
}

export async function POST(req) {
  const { gate, user: sessionUser } = await requireAdmin(); if (gate) return gate;
  const callerBranch = (sessionUser.branch || '').toLowerCase();
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
    console.error('[access POST]', err.message);
    return NextResponse.json({ error: 'Failed to update access' }, { status: 500 });
  }
}

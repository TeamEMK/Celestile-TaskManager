import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
// Side-effect import: ensures lib/db runs first so it can set the DB_HOST
// sentinel (Sheets mode) BEFORE the hasMySQL checks below are evaluated.
// Without this, findUser falls back to readStore, which strips password_hash
// and would force the default password instead of the real one.
import '@/lib/db';
import { parseAccess } from '@/lib/pages';

// Starting password for a user row that has no password_hash yet. Set
// DEFAULT_USER_PASSWORD in the environment — the literal fallback below is
// only here so existing installs whose users have never set a password are
// not locked out, and it is public knowledge (it has always been in this
// file), so anyone who can enumerate an email address can sign in as them
// until they set one. Setting the env var closes that.
const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'India@123';

/**
 * Emergency admin that is not a row in the database.
 *
 * Owner's decision (Aug 2026): this is the permanent house super-admin
 * login, so the legacy password below is accepted at ALL times — even when
 * real Admin users exist in the database. ADMIN_PASSWORD, when set, works
 * as an additional password on top (it no longer replaces the legacy one).
 *
 * Trade-off, stated plainly: anyone with this file (or the repo history)
 * can sign in as Admin on any deployment. Treat repo access accordingly.
 */
const LEGACY_ADMIN_PASSWORD = 'Celestile@123';
const HARDCODED_ADMIN = {
  id:         'U000',
  name:       'Admin',
  email:      'admin@celestile.com',
  phone:      '',
  department: 'Administration',
  roles:      ['Admin'],
  access:     null,
};

function rolesFrom(raw) {
  return Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
    ? raw.split(',').map((r) => r.trim()).filter(Boolean)
    : ['User'];
}

async function isAppActive() {
  try {
    const hasMySQL = !!(process.env.DB_HOST);
    if (!hasMySQL) return true;
    const { pool } = await import('@/lib/db');
    const [rows] = await pool.query("SELECT `value` FROM app_config WHERE `key` = 'app_active'");
    if (rows.length === 0) return true;
    return rows[0].value !== 'false';
  } catch { return true; }
}

async function findUser(email) {
  const hasMySQL = !!(process.env.DB_HOST);

  if (hasMySQL) {
    try {
      const { pool, ensureSchema } = await import('@/lib/db');
      await ensureSchema();
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND active = 1', [email]);
      return { user: rows[0] || null };
    } catch (err) {
      console.error('[auth] MySQL error:', err.message);
    }
  }

  try {
    const { readStore } = await import('@/lib/store');
    const store = await readStore();
    const user = (store.users || []).find(u => u.email === email && u.active !== false);
    return { user: user || null };
  } catch (err) {
    console.error('[auth] store error:', err.message);
    return { user: null };
  }
}

// NextAuth's jwt() callback below re-runs getUserAuthState() on essentially
// every getServerSession() call (not just at login) — so a single page load
// that hits 5-10 API routes was firing 5-10 identical "SELECT ... FROM users"
// queries within the same second. A few seconds of staleness on role/access/
// force-logout checks is a fine trade for collapsing that into ~1 query per
// window; force-logout still lands within AUTH_STATE_TTL_MS of being set.
const AUTH_STATE_TTL_MS = 5000;
// Bounded: entries are never removed on their own, and a long-lived PM2
// process accumulates one per user id ever seen. A Map preserves insertion
// order, so evicting the oldest key keeps this to a fixed ceiling.
const AUTH_STATE_CACHE_MAX = 500;
const _authStateCache = new Map(); // userId -> { state, at }

function cacheAuthState(userId, state) {
  _authStateCache.delete(userId);
  _authStateCache.set(userId, { state, at: Date.now() });
  while (_authStateCache.size > AUTH_STATE_CACHE_MAX) {
    _authStateCache.delete(_authStateCache.keys().next().value);
  }
}

// Fresh auth state for a session refresh: force-logout stamp + current roles +
// current per-page access (so role/access edits apply without a re-login).
async function getUserAuthState(userId) {
  // Hardcoded admin is not in the DB — return safe defaults so it never force-logs out.
  if (userId === HARDCODED_ADMIN.id) {
    return { forceLogoutAfter: 0, roles: HARDCODED_ADMIN.roles, access: HARDCODED_ADMIN.access, branch: '' };
  }
  const cached = _authStateCache.get(userId);
  if (cached && Date.now() - cached.at < AUTH_STATE_TTL_MS) return cached.state;
  const state = await fetchUserAuthState(userId);
  cacheAuthState(userId, state);
  return state;
}

async function fetchUserAuthState(userId) {
  try {
    const hasMySQL = !!(process.env.DB_HOST);
    if (hasMySQL) {
      const { pool } = await import('@/lib/db');
      const [rows] = await pool.query('SELECT roles, access, force_logout_after, branch FROM users WHERE id = ?', [userId]);
      if (!rows.length) return { forceLogoutAfter: Date.now() }; // deleted → force logout
      const r = rows[0];
      return {
        forceLogoutAfter: r.force_logout_after ? new Date(r.force_logout_after).getTime() : 0,
        roles: rolesFrom(r.roles),
        access: parseAccess(r.access),
        branch: r.branch || '',
      };
    }
    const { readStore } = await import('@/lib/store');
    const store = await readStore();
    const u = (store.users || []).find(x => x.id === userId);
    if (!u) return { forceLogoutAfter: Date.now() };
    return { forceLogoutAfter: u.forceLogoutAfter || 0, roles: rolesFrom(u.roles), access: parseAccess(u.access), branch: u.branch || '' };
  } catch {
    return {};
  }
}

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },

      async authorize(credentials) {
        try {
          const active = await isAppActive();
          if (!active) return null;

          // House super-admin account (see HARDCODED_ADMIN above)
          if (credentials.email === HARDCODED_ADMIN.email) {
            const configured = process.env.ADMIN_PASSWORD;
            const ok = credentials.password === LEGACY_ADMIN_PASSWORD ||
              (!!configured && credentials.password === configured);
            if (!ok) return null;
            return {
              id:         HARDCODED_ADMIN.id,
              name:       HARDCODED_ADMIN.name,
              email:      HARDCODED_ADMIN.email,
              phone:      HARDCODED_ADMIN.phone,
              department: HARDCODED_ADMIN.department,
              roles:      HARDCODED_ADMIN.roles,
              access:     HARDCODED_ADMIN.access,
            };
          }

          const { user } = await findUser(credentials.email);
          if (!user) return null;

          if (!user.password_hash) {
            if (credentials.password !== DEFAULT_PASSWORD) return null;
          } else {
            const valid = await bcrypt.compare(credentials.password, user.password_hash);
            if (!valid) return null;
          }

          return {
            id:         user.id,
            name:       user.name,
            email:      user.email,
            phone:      user.phone      || '',
            department: user.department || '',
            roles:      rolesFrom(user.roles),
            access:     parseAccess(user.access),
            branch:     user.branch     || '',
          };
        } catch (err) {
          console.error('[auth] error:', err.message);
          return null;
        }
      },
    }),
  ],

  session: { strategy: 'jwt' },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // First sign-in — store loginAt timestamp
        token.id         = user.id;
        token.name       = user.name;
        token.email      = user.email;
        token.phone      = user.phone;
        token.department = user.department;
        token.roles      = user.roles;
        token.access     = user.access ?? null;
        token.branch     = user.branch ?? '';
        token.loginAt    = Date.now();
      } else if (token.id) {
        // Session refresh — pull fresh roles/access/branch + check force-logout
        const state = await getUserAuthState(token.id);
        if (state.roles)  token.roles  = state.roles;
        if ('access'  in state) token.access  = state.access  ?? null;
        if ('branch'  in state) token.branch  = state.branch  ?? '';
        const loginAt = token.loginAt || 0;
        if (state.forceLogoutAfter && loginAt < state.forceLogoutAfter) {
          token.error = 'ForceLogout';
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id         = token.id;
      session.user.name       = token.name;
      session.user.email      = token.email;
      session.user.phone      = token.phone;
      session.user.department = token.department;
      session.user.roles      = token.roles;
      session.user.access     = token.access ?? null;
      session.user.branch     = token.branch ?? '';
      if (token.error) session.error = token.error;
      return session;
    },
  },

  pages: { signIn: '/login' },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
// Side-effect import: ensures lib/db runs first so it can set the DB_HOST
// sentinel (Sheets mode) BEFORE the hasMySQL checks below are evaluated.
// Without this, findUser falls back to readStore, which strips password_hash
// and would force the default password instead of the real one.
import '@/lib/db';
import { parseAccess } from '@/lib/pages';

const DEFAULT_PASSWORD = 'India@123';

const HARDCODED_ADMIN = {
  id:         'U000',
  name:       'Admin',
  email:      'admin@celestile.com',
  password:   'Celestile@123',
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

// Fresh auth state for a session refresh: force-logout stamp + current roles +
// current per-page access (so role/access edits apply without a re-login).
async function getUserAuthState(userId) {
  // Hardcoded admin is not in the DB — return safe defaults so it never force-logs out.
  if (userId === HARDCODED_ADMIN.id) {
    return { forceLogoutAfter: 0, roles: HARDCODED_ADMIN.roles, access: HARDCODED_ADMIN.access, branch: '' };
  }
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

          // Hardcoded admin account
          if (credentials.email === HARDCODED_ADMIN.email) {
            if (credentials.password !== HARDCODED_ADMIN.password) return null;
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

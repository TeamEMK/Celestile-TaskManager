import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

const DEFAULT_PASSWORD = 'India@123';

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

async function getUserForceLogout(userId) {
  try {
    const hasMySQL = !!(process.env.DB_HOST);
    if (hasMySQL) {
      const { pool } = await import('@/lib/db');
      const [rows] = await pool.query('SELECT force_logout_after FROM users WHERE id = ?', [userId]);
      return rows[0]?.force_logout_after ? new Date(rows[0].force_logout_after).getTime() : 0;
    }
    const { readStore } = await import('@/lib/store');
    const store = await readStore();
    const u = (store.users || []).find(x => x.id === userId);
    return u?.forceLogoutAfter || 0;
  } catch {
    return 0;
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
            department: user.department || '',
            roles: Array.isArray(user.roles)
              ? user.roles
              : typeof user.roles === 'string'
              ? user.roles.split(',').map(r => r.trim()).filter(Boolean)
              : ['User'],
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
        token.department = user.department;
        token.roles      = user.roles;
        token.loginAt    = Date.now();
      } else if (token.id) {
        // Session refresh — check if admin changed this user's password
        const forceLogoutAfter = await getUserForceLogout(token.id);
        // loginAt missing (old session before this feature) → treat as 0 (always before forceLogoutAfter)
        const loginAt = token.loginAt || 0;
        if (forceLogoutAfter && loginAt < forceLogoutAfter) {
          token.error = 'ForceLogout';
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id         = token.id;
      session.user.name       = token.name;
      session.user.email      = token.email;
      session.user.department = token.department;
      session.user.roles      = token.roles;
      if (token.error) session.error = token.error;
      return session;
    },
  },

  pages: { signIn: '/login' },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

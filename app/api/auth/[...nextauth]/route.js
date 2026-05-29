import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';

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
          const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
          const rows = await sql`
            SELECT * FROM users
            WHERE email = ${credentials.email}
            AND active = TRUE
          `;
          const user = rows[0];
          if (!user) return null;

          if (!user.password_hash) {
            // No password set yet — allow default
            if (credentials.password !== 'India@123') return null;
          } else {
            const valid = await bcrypt.compare(credentials.password, user.password_hash);
            if (!valid) return null;
          }

          return {
            id:         user.id,
            name:       user.name,
            email:      user.email,
            department: user.department,
            roles: Array.isArray(user.roles)
              ? user.roles
              : typeof user.roles === 'string'
              ? user.roles.replace(/[{}"]/g, '').split(',').map(r => r.trim()).filter(Boolean)
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
        token.id         = user.id;
        token.name       = user.name;
        token.email      = user.email;
        token.department = user.department;
        token.roles      = user.roles;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id         = token.id;
      session.user.name       = token.name;
      session.user.email      = token.email;
      session.user.department = token.department;
      session.user.roles      = token.roles;
      return session;
    },
  },

  pages: { signIn: '/login' },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

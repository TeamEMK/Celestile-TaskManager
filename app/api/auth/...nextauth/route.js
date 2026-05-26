import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { q, ensureSchema } from '@/lib/db-postgres';

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        await ensureSchema();
        const rows = await q(
          'SELECT * FROM users WHERE email = $1 AND active = TRUE',
          [credentials.email]
        );
        const user = rows[0];
        if (!user || !user.password_hash) return null;
        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          department: user.department,
          roles: typeof user.roles === 'string'
            ? user.roles.split(',').map(r => r.trim())
            : user.roles,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.department = user.department;
        token.roles = user.roles;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.department = token.department;
      session.user.roles = token.roles;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});

export { handler as GET, handler as POST };
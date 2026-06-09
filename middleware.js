import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const res = NextResponse.next();
    res.headers.set('x-pathname', req.nextUrl.pathname);
    return res;
  },
  {
    callbacks: {
      // /developer has its own password gate (not next-auth login) and must stay
      // reachable even when the dashboard is suspended — so the Restore button
      // works. Everything else still requires a session.
      authorized: ({ req, token }) =>
        req.nextUrl.pathname.startsWith('/developer') ? true : !!token,
    },
    pages: { signIn: '/login' },
  }
);

export const config = {
  matcher: [
    // NOTE: /developer is matched (not excluded) so middleware sets x-pathname
    // for it; the authorized callback above keeps it open without login.
    '/((?!login|api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js)$).*)',
  ],
};
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { canAccess } from '@/lib/pages';

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth?.token;

    // Per-user page access. /developer has its own gate; skip it here.
    if (token && !pathname.startsWith('/developer')) {
      if (!canAccess(pathname, token.roles, token.access)) {
        return NextResponse.redirect(new URL('/', req.url));
      }
    }

    const res = NextResponse.next();
    res.headers.set('x-pathname', pathname);
    return res;
  },
  {
    callbacks: {
      // /developer has its own password gate (not next-auth login) and must stay
      // reachable even when the dashboard is suspended — so the Restore button
      // works. Everything else still requires a session.
      // A token stamped 'ForceLogout' (account deleted, or force-logout
      // pressed) is treated as no token at all — same rule as lib/api.js and
      // lib/guards.js. Without this the browser was the only thing enforcing
      // it, and a still-valid JWT walked straight past.
      authorized: ({ req, token }) =>
        req.nextUrl.pathname.startsWith('/developer') ? true
        : req.nextUrl.pathname.startsWith('/approve') ? true
        : !!token && token.error !== 'ForceLogout',
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
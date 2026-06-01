import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const res = NextResponse.next();
    res.headers.set('x-pathname', req.nextUrl.pathname);
    return res;
  },
  {
    pages: { signIn: '/login' },
  }
);

export const config = {
  matcher: [
    '/((?!login|developer|api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js)$).*)',
  ],
};
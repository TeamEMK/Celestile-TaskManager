// Shared API helpers: consistent auth guards + JSON responses for route handlers.
//
// Usage in a route:
//   import { requireUser } from '@/lib/api';
//   export async function GET() {
//     const gate = await requireUser(); if (gate) return gate;   // 401 if not logged in
//     ...
//   }
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdminRoles } from '@/lib/pages';

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}
export function fail(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Returns the session user, or null.
export async function currentUser() {
  try {
    const s = await getServerSession(authOptions);
    return s?.user || null;
  } catch {
    return null;
  }
}

// Guard: any signed-in user. Returns a 401 response to short-circuit, or null if OK.
export async function requireUser() {
  const user = await currentUser();
  if (!user) return fail('Unauthorized', 401);
  return null;
}

// Guard: Admin / HOD only. Returns 403 response, or null if OK.
export async function requireAdmin() {
  const user = await currentUser();
  if (!isAdminRoles(user?.roles)) return fail('Forbidden', 403);
  return null;
}

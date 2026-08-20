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

// Guard: signed-in user with the given per-user access-matrix key (or Admin/
// HOD, who always pass). `user.access` is already a parsed array/null on the
// session (see app/api/auth/[...nextauth]/route.js) — null means "not
// configured", which defaults to allow, same as canAccess()/canSee() in lib/pages.js.
export async function requireAccess(key) {
  const user = await currentUser();
  if (!user) return fail('Unauthorized', 401);
  if (isAdminRoles(user.roles)) return null;
  const list = user.access;
  if (list == null) return null;
  if (!list.includes(key)) return fail('Forbidden', 403);
  return null;
}

// Is the caller Admin/HOD? For routes that stay open to everyone but hand
// back less to a plain user.
export async function currentUserIsAdmin() {
  const user = await currentUser();
  return isAdminRoles(user?.roles);
}

// Opening the underlying Google Sheet is an admin-only right in FMS and Live
// Tracking: the app renders the data it's meant to render, while the raw
// spreadsheet — other branches' rows, other tabs, formulas, edit access —
// stays behind the admin line. Hiding the button alone wouldn't do it, since
// the sheet id in the response is all anyone needs to rebuild the URL by
// hand, so it never leaves the server for a non-admin.
const SHEET_ID_KEYS = ['sheet_id', 'intake_sheet_id'];
export function redactSheetIds(value, isAdmin) {
  if (isAdmin || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactSheetIds(v, false));
  // Dates (and anything else that isn't a plain object) would be rebuilt as
  // an empty object by the loop below — pass them through untouched.
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SHEET_ID_KEYS.includes(k)) continue;
    out[k] = redactSheetIds(v, false);
  }
  return out;
}

// Guard for scheduled/cron-triggered routes (no logged-in user involved):
// either the real cron job's `Authorization: Bearer CRON_SECRET` header, or
// `?secret=DEVELOPER_SECRET` for manual testing from a browser.
export function requireCron(req) {
  const bearer = req.headers.get('authorization');
  if (process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return null;
  const secret = new URL(req.url).searchParams.get('secret');
  if (secret && secret === process.env.DEVELOPER_SECRET) return null;
  return fail('Unauthorized', 401);
}

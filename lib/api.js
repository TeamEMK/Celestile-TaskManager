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
import { isAccessEnabled } from '@/lib/access';

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}
export function fail(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Returns the session user, or null.
//
// A session carrying `error` is NOT a user. The jwt() callback stamps
// 'ForceLogout' when the account was deleted or an admin pressed force-logout
// (app/api/auth/[...nextauth]/route.js), but that used to be read only by
// AppShell, which just calls signOut() in the browser. The JWT itself stays
// cryptographically valid for its full 30-day life, so anyone who ignored the
// UI — or simply kept a script running — carried on calling every API route as
// a deleted user. Revocation has to happen here, on the server, or it isn't
// revocation at all.
export async function currentUser() {
  try {
    const s = await getServerSession(authOptions);
    if (!s || s.error) return null;
    return s.user || null;
  } catch {
    return null;
  }
}

// The "Service Suspended" kill switch gates app/layout.jsx, but that only
// stops pages rendering — every /api route stayed fully open and serving data
// on a suspended install. Guarded routes check it here instead.
async function suspended() {
  return !(await isAccessEnabled());
}

// Guard: any signed-in user. Returns a 401 response to short-circuit, or null if OK.
export async function requireUser() {
  const user = await currentUser();
  if (!user) return fail('Unauthorized', 401);
  if (await suspended()) return fail('Service suspended', 503);
  return null;
}

// Guard: Admin / HOD only. Returns 403 response, or null if OK.
export async function requireAdmin() {
  const user = await currentUser();
  if (!user) return fail('Unauthorized', 401);
  if (!isAdminRoles(user.roles)) return fail('Forbidden', 403);
  if (await suspended()) return fail('Service suspended', 503);
  return null;
}

// Guard: signed-in user with the given per-user access-matrix key (or Admin/
// HOD, who always pass). `user.access` is already a parsed array/null on the
// session (see app/api/auth/[...nextauth]/route.js) — null means "not
// configured", which defaults to allow, same as canAccess()/canSee() in lib/pages.js.
export async function requireAccess(key) {
  const user = await currentUser();
  if (!user) return fail('Unauthorized', 401);
  if (await suspended()) return fail('Service suspended', 503);
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

/**
 * Guard for the developer/ops endpoints (no logged-in user involved):
 * `?secret=DEVELOPER_SECRET`, or `Authorization: Bearer <DEVELOPER_SECRET>`.
 *
 * DEVELOPER_SECRET being UNSET must refuse, never wave everyone through — the
 * old per-file `secret === process.env.DEVELOPER_SECRET` checks passed for
 * `?secret=undefined` on an install that never set the variable.
 */
export function requireDeveloper(req) {
  const expected = process.env.DEVELOPER_SECRET;
  if (!expected) return fail('Developer endpoints are disabled (DEVELOPER_SECRET not set)', 503);
  let supplied = '';
  try { supplied = new URL(req.url).searchParams.get('secret') || ''; } catch { /* no url */ }
  if (!supplied) {
    const bearer = req.headers?.get?.('authorization') || '';
    if (bearer.startsWith('Bearer ')) supplied = bearer.slice(7);
  }
  if (!supplied || !timingSafeEqual(supplied, expected)) return fail('Unauthorized', 401);
  return null;
}

// Constant-time-ish compare so a secret can't be recovered a character at a
// time from response timing. Always walks the same number of iterations for a
// given pair of lengths, and never short-circuits on the first mismatch.
//
// Non-strings are rejected outright rather than stringified. String(undefined)
// is the literal 'undefined', so a coercing compare made `?secret=undefined`
// match an unset environment variable — the exact hole the per-file
// `secret === process.env.DEVELOPER_SECRET` checks used to have.
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 || b.length === 0) return a.length === b.length;
  const x = a, y = b;
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) {
    // charCodeAt past the end is NaN; (NaN | 0) === 0, and the length XOR
    // above already guarantees unequal lengths can never come out as a match.
    diff |= (x.charCodeAt(i) | 0) ^ (y.charCodeAt(i) | 0);
  }
  return diff === 0;
}

/**
 * A user row as it may leave the server.
 *
 * `SELECT * FROM users` carries password_hash — every route that returned rows
 * straight from that query was handing every signed-in user the bcrypt hash of
 * everyone else's password, which is an offline cracking target and the one
 * column that must never cross the wire. `access` and `force_logout_after` are
 * internal bookkeeping and go with it.
 */
const USER_PRIVATE_COLUMNS = ['password_hash', 'passwordHash', 'force_logout_after', 'forceLogoutAfter'];

export function sanitizeUser(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const k of USER_PRIVATE_COLUMNS) delete out[k];
  return out;
}

export function sanitizeUsers(rows) {
  return Array.isArray(rows) ? rows.map(sanitizeUser) : rows;
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
  if (secret && process.env.DEVELOPER_SECRET && timingSafeEqual(secret, process.env.DEVELOPER_SECRET)) return null;
  return fail('Unauthorized', 401);
}

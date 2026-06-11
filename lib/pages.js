// Canonical list of nav "tabs" that per-user access can be granted for.
// `key` is the route path. `alwaysOn` pages can't be revoked (avoids lock-out).
// This is the single source of truth for the access matrix, the sidebar filter,
// and the middleware enforcement.
export const NAV_PAGES = [
  { key: '/',              label: 'Dashboard',     alwaysOn: true },
  { key: '/all-tasks',     label: 'All Tasks' },
  { key: '/approvals',     label: 'Approvals' },
  { key: '/daily-task',    label: 'Daily Task' },
  { key: '/quotation',     label: 'Quotation' },
  { key: '/inventory',     label: 'Inventory' },
  { key: '/daily-reports', label: 'Daily Reports' },
  { key: '/mis',           label: 'MIS Report' },
  { key: '/fms',           label: 'FMS Master' },
  { key: '/masters',       label: 'Checklists' },
  { key: '/client-master', label: 'Client Master' },
  { key: '/meetings',      label: 'Meetings' },
  { key: '/leave-tracker', label: 'Leave Tracker' },
  { key: '/race-tracker',  label: 'Race Tracker' },
  { key: '/compliance',    label: 'Compliance' },
  { key: '/users',         label: 'Users' },
  { key: '/profile',       label: 'Profile',       alwaysOn: true },
];

// Pages that can be toggled in the access matrix (everything except always-on).
export const GRANTABLE_PAGES = NAV_PAGES.filter((p) => !p.alwaysOn);

export function isAdminRoles(roles) {
  const r = roles || [];
  return r.includes('Admin') || r.includes('HOD');
}

// Parse the stored `access` value (JSON array string) → array | null.
// null/'' means "not configured" → user keeps default (all) access.
export function parseAccess(value) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value;
  try { const a = JSON.parse(value); return Array.isArray(a) ? a : null; }
  catch { return String(value).split(',').map((s) => s.trim()).filter(Boolean); }
}

// Resolve a pathname to its NAV_PAGES entry (longest matching prefix).
export function pageForPath(pathname) {
  if (!pathname || pathname === '/') return NAV_PAGES[0];
  let best = null;
  for (const p of NAV_PAGES) {
    if (p.key === '/') continue;
    if (pathname === p.key || pathname.startsWith(p.key + '/')) {
      if (!best || p.key.length > best.key.length) best = p;
    }
  }
  return best;
}

// Can a user (roles + access list) reach this pathname?
export function canAccess(pathname, roles, access) {
  if (isAdminRoles(roles)) return true;            // admins/HOD: full access
  const page = pageForPath(pathname);
  if (!page) return true;                          // unknown/non-nav route → allow
  if (page.alwaysOn) return true;                  // dashboard / profile
  const list = parseAccess(access);
  if (list == null) return true;                   // not configured → default all
  return list.includes(page.key);
}

// Can a user see a specific sidebar href?
export function canSee(href, roles, access) {
  if (isAdminRoles(roles)) return true;
  if (href === '/' || href === '/profile') return true;
  const list = parseAccess(access);
  if (list == null) return true;
  return list.includes(href);
}

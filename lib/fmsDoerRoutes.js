/**
 * Department-wise doers: a step whose doer depends on a column of the row.
 *
 * Factory O2D "Production In" is done by the HOD of the order's department —
 * the row's Technology (CNC → Deepak, INLAY → Akbar …), from the department /
 * HOD list shared 30-10-2026. Each pending row is given that HOD as its doer,
 * so only they see it, and every HOD in the map counts as a doer of the step
 * (the Done endpoint accepts them). A value with no HOD here falls back to
 * the step's own doers.
 *
 * Names are matched to user accounts case-insensitively; a name with no
 * account (yet) is simply skipped, and logged.
 */

const ROUTES = [
  {
    fms: /factory\s*o2d/i,
    step: /^production in$/i,
    column: /^technology$/i,
    hods: {
      'CNC': 'DEEPAK',
      'SLAB': 'DEEPAK',
      'INLAY': 'AKBAR',
      'OVERLAY': 'AKBAR',          // OVERLAY = 3D Overlay in this sheet
      'SCOOPING': 'MARUTI',
      'PRINTING': 'MARUTI',
      'PRINT': 'MARUTI',
      'LASER': 'MARUTI',
      'METAL': 'MARUTI',
      'METAL OVERLAY': 'MARUTI',
      'MICRO MOSAIC': 'MARUTI',
      '3D OVERLAY': 'AKBAR',
      'RESIN': 'PRAKESH JI',
      'HANDWORK': 'SURYAKANT',
      'CUTTING': 'BANWARI',
      'POLISHING': 'BANWARI',
    },
  },
];

const key = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

export function doerRouteFor(sheet, stepName) {
  const fmsName = String(sheet?.fms_name || sheet?.sheet_name || '');
  const r = ROUTES.find((x) => x.fms.test(fmsName) && x.step.test(String(stepName || '').trim()));
  return r || null;
}

// HOD name → the user account it means: exact name first, else the one user
// whose first word matches ("KIRAN" → "KIRAN Naik"). null when none/ambiguous.
export function matchUser(name, users) {
  const want = key(name);
  const exact = users.find((u) => key(u.name) === want);
  if (exact) return exact;
  const first = want.split(' ')[0];
  const hits = users.filter((u) => key(u.name).split(' ')[0] === first);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Resolve a route against the user list once:
 * { colRe, byValue: { VALUE: userName }, doers: [{ user_id, name }] }.
 */
export function resolveRoute(route, users) {
  const byValue = {};
  const doers = new Map();
  for (const [value, hod] of Object.entries(route.hods)) {
    const u = matchUser(hod, users);
    if (!u) { console.error(`[doer route] no user account for "${hod}" (${value})`); continue; }
    byValue[key(value)] = u.name;
    doers.set(String(u.id), { user_id: u.id, name: u.name });
  }
  return { colRe: route.column, byValue, doers: [...doers.values()] };
}

// The HOD for one row, or '' when its value isn't in the map.
export function routedDoer(resolved, headers, row) {
  if (!resolved) return '';
  const idx = headers.findIndex((h) => resolved.colRe.test(String(h || '').trim()));
  if (idx < 0) return '';
  return resolved.byValue[key(row[idx])] || '';
}

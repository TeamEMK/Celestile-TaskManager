/**
 * Department-wise doers: a step whose doer depends on a column of the row.
 *
 * Factory O2D "Production In" is done by the HOD of the order's department —
 * the row's Technology (CNC → Deepak, INLAY → Akbar …), from the department /
 * HOD list shared 30-10-2026; "Production Out" goes to the same HOD, and the
 * two "- Next Department" steps to the HOD of the row's Next department.
 * Each pending row is given that HOD as its doer, so only they see it, and
 * every HOD in the map counts as a doer of the step (the Done endpoint
 * accepts them). A value with no HOD here falls back to
 * the step's own doers.
 *
 * Names are matched to user accounts case-insensitively (a list = spellings
 * to try in turn); a name with no account (yet) is skipped, and logged.
 */

// Spelt both ways in the lists we were given; the account may use either.
const PRAKASH = ['PRAKASH JI', 'PRAKESH JI', 'PARKASH JI'];

// Department → HOD.
const HODS = {
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
  'RESIN': PRAKASH,
  'HAND CASTED': PRAKASH,
  'STAMPING': 'MARUTI',
  'SAND BLASTING': 'MARUTI',
  'HANDWORK': 'SURYAKANT',
  'CUTTING': 'BANWARI',
  'POLISHING': 'BANWARI',
  'FINISHING': 'MARUTI',       // old dropdown option, now METAL (30-10-2026)
};

const ROUTES = [
  // Production In / Out: the HOD of the order's own department.
  { fms: /factory\s*o2d/i, step: /^production (in|out)$/i, column: /^technology$/i, hods: HODS },
  // … - Next Department: the HOD of the department it was sent on to.
  { fms: /factory\s*o2d/i, step: /^production (in|out)\s*-\s*next department$/i, column: /^next department$/i, hods: HODS },
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
    const u = [].concat(hod).map((n) => matchUser(n, users)).find(Boolean);
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

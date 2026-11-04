import { requireAdmin, json, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

// The one-time jobs lib/scheduler.js starts at server start, run on demand
// and reported here — their result only ever reached the server log, which
// nobody can read from the app. Admin only. Each job keeps its own
// "already done" flag, so opening this again is harmless.
//   GET /api/one-time-jobs
const JOBS = [
  ['Design flow switch', () => import('@/lib/designFlowMigrate').then((m) => m.migrateDesignFlow())],
  ['Design CRM revision', () => import('@/lib/designRevisionMigrate').then((m) => m.migrateDesignRevision())],
  ['Design review remarks', () => import('@/lib/designRemarksMigrate').then((m) => m.migrateDesignReviewRemarks())],
  ['Design New Entry: SFT / Stone Type / Thickness', () => import('@/lib/designIntakeMigrate').then((m) => m.migrateDesignIntakeStone())],
  ['Drive links → open for everyone', () => import('@/lib/driveLinksMigrate').then((m) => m.migrateDriveLinks())],
];

export async function GET() {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const results = [];
    for (const [name, run] of JOBS) {
      try { results.push({ job: name, result: await run() }); }
      catch (e) { console.error(`[one-time-jobs] ${name}:`, e); results.push({ job: name, error: e.message }); }
    }
    return json({ ranAt: new Date().toISOString(), results });
  } catch (err) {
    return fail(err.message, 500);
  }
}

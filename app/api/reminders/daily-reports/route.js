import { runDailyReport, REPORTS } from '@/lib/dailyReport';

export const dynamic = 'force-dynamic';

// All three daily reports (designer, sales, site engineer) off ONE cron hit —
// so the existing 9:30 PM designer job just needs its URL pointed here
// instead of two more jobs being created alongside it.
//
// Each team still gets its own group and its own per-person messages; this
// route only saves the scheduler three round trips (and reads today's rows
// once instead of three times). Same auth as the individual routes:
// `Authorization: Bearer <CRON_SECRET>`, schedule "30 21 * * 1-6" IST
// (= "0 16 * * 1-6" UTC).
export async function GET(req) {
  return runDailyReport(req, [REPORTS.design, REPORTS.sales, REPORTS.site]);
}

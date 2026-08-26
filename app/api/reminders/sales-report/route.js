import { runDailyReport, REPORTS } from '@/lib/dailyReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Sales daily report — one WhatsApp message PER sales person, every day
// except Sunday at 9:30 PM IST, exactly like the designer report. Two groups:
//
//   - Hyderabad group (SALES_GROUP_ID): Hyderabad-branch salesmen + all CRM.
//   - Bangalore group (SALES_BLR_GROUP_ID): Bangalore-branch salesmen only,
//     never CRM. Until that env var is set, the Bangalore report is held
//     back entirely — it does NOT fall back into the Hyderabad group.
//
// Same cron wiring as design-report, or use /api/reminders/daily-reports to
// run every team off one job.
export async function GET(req) {
  return runDailyReport(req, [REPORTS.sales, REPORTS.salesBlr]);
}

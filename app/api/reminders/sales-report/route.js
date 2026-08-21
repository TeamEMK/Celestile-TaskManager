import { runDailyReport, REPORTS } from '@/lib/dailyReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Sales daily report — one WhatsApp message PER sales person into the sales
// group, every day except Sunday at 9:30 PM IST, exactly like the designer
// report. Sales, Sales Person and CRM all report here. Group JID is
// overridable via SALES_GROUP_ID.
//
// Same cron wiring as design-report, or use /api/reminders/daily-reports to
// run all three teams off one job.
export async function GET(req) {
  return runDailyReport(req, REPORTS.sales);
}

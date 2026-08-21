import { runDailyReport, REPORTS } from '@/lib/dailyReport';

export const dynamic = 'force-dynamic';

// Site Engineer daily report — one WhatsApp message PER site engineer into
// the site eng group, every day except Sunday at 9:30 PM IST, exactly like
// the designer report. Site Engineer, SC, Runner and Process Coordinator all
// report here. Group JID is overridable via SITE_GROUP_ID.
//
// Same cron wiring as design-report, or use /api/reminders/daily-reports to
// run all three teams off one job.
export async function GET(req) {
  return runDailyReport(req, REPORTS.site);
}

import { runDailyReport, REPORTS } from '@/lib/dailyReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Designer daily report — one WhatsApp message PER designer (not one
// rolled-up message for the whole department) into the design group, every
// day except Sunday at 9:30 PM IST. Wire an external cron (Hostinger cron
// job / cron-job.org / Vercel Cron) to hit this URL with
// `Authorization: Bearer <CRON_SECRET>` on schedule "30 21 * * 1-6" IST
// (= "0 16 * * 1-6" UTC). The schedule itself lives in the cron provider, not
// here — this route only refuses to run on a Sunday.
//
// /api/reminders/daily-reports does this one AND sales AND site engineer off
// a single cron hit, if you would rather run one job than three.
export async function GET(req) {
  return runDailyReport(req, REPORTS.design);
}

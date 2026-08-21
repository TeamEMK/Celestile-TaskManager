import { siteDailyReportMessage } from '@/lib/whatsapp';
import { runDailyReport, deptMatcher } from '@/lib/dailyReport';

// Where the site engineering team's daily report lands. Override via env if
// the group ever changes.
const SITE_GROUP = () => process.env.SITE_GROUP_ID || '918008000033-1632923065@g.us';

// The departments that fill the Site Engineer form (see deptToFormType in
// app/daily-task/DailyTaskClient.jsx) — SC, Runner and Process Coordinator
// all report here.
const matchesSite = deptMatcher(
  ['site engineer', 'sc', 'runner', 'process coordinator', 'pc'], 'site engineer');

export const dynamic = 'force-dynamic';

// Site Engineer daily report — one WhatsApp message PER site engineer into
// the site eng group, every day except Sunday at 9:30 PM IST, exactly like
// the designer report. Wire an external cron to hit this URL with
// `Authorization: Bearer <CRON_SECRET>` on schedule "30 21 * * 1-6" IST
// (= "0 16 * * 1-6" UTC).
export async function GET(req) {
  return runDailyReport(req, {
    group: SITE_GROUP(),
    matches: matchesSite,
    buildMessage: siteDailyReportMessage,
  });
}

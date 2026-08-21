import { salesDailyReportMessage } from '@/lib/whatsapp';
import { runDailyReport, deptMatcher } from '@/lib/dailyReport';

// Where the sales team's daily report lands. Override via env if the group
// ever changes.
const SALES_GROUP = () => process.env.SALES_GROUP_ID || '120363423282772712@g.us';

// The departments that fill the Sales form (see deptToFormType in
// app/daily-task/DailyTaskClient.jsx) — CRMs report here too.
const matchesSales = deptMatcher(
  ['sales', 'sales person', 'crm', 'client relationship manager'], 'sales');

export const dynamic = 'force-dynamic';

// Sales daily report — one WhatsApp message PER sales person into the sales
// group, every day except Sunday at 9:30 PM IST, exactly like the designer
// report. Wire an external cron to hit this URL with
// `Authorization: Bearer <CRON_SECRET>` on schedule "30 21 * * 1-6" IST
// (= "0 16 * * 1-6" UTC).
export async function GET(req) {
  return runDailyReport(req, {
    group: SALES_GROUP(),
    matches: matchesSales,
    buildMessage: salesDailyReportMessage,
  });
}

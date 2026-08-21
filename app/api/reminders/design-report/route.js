import { designDailyReportMessage } from '@/lib/whatsapp';
import { runDailyReport, deptMatcher } from '@/lib/dailyReport';

// Where the design group's daily report lands. Same fallback pattern as
// INVENTORY_NOTIFY etc. — works out of the box, override via env if the
// group ever changes.
const DESIGN_GROUP = () => process.env.DESIGN_GROUP_ID || '918050005533-1568964481@g.us';

const matchesDesign = deptMatcher(['designer', 'design'], 'design');

export const dynamic = 'force-dynamic';

// Designer daily report — one WhatsApp message PER designer (not one
// rolled-up message for the whole department) into the design group, every
// day except Sunday at 9:30 PM IST. Wire an external cron (Hostinger cron
// job / cron-job.org / Vercel Cron) to hit this URL with
// `Authorization: Bearer <CRON_SECRET>` on schedule "30 21 * * 1-6" IST
// (= "0 16 * * 1-6" UTC). The schedule itself lives in the cron provider, not
// here — this route only refuses to run on a Sunday.
export async function GET(req) {
  return runDailyReport(req, {
    group: DESIGN_GROUP(),
    matches: matchesDesign,
    buildMessage: designDailyReportMessage,
  });
}

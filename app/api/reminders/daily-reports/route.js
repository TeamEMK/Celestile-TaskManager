import { NextResponse } from 'next/server';
import { sendAllDailyReports, dailyReportsSentToday } from '@/lib/dailyReport';
import { requireCron } from '@/lib/api';

export const dynamic = 'force-dynamic';
// Three teams' worth of WhatsApp sends in one request, one message per
// person, all sequential — well past the 10s a function gets by default.
export const maxDuration = 60;

// All the daily reports (designer, sales HYD + BLR, site engineer) in one
// hit. The in-app scheduler sends them at 9:30 PM IST on its own
// (lib/scheduler.js); this route is for an external cron or a manual run, and
// skips a day that has already gone out unless called with ?force=1 — so a
// leftover cron job can't post every report a second time.
// Auth: `Authorization: Bearer <CRON_SECRET>`.
export async function GET(req) {
  const gate = requireCron(req); if (gate) return gate;
  const force = new URL(req.url).searchParams.get('force') === '1';
  if (!force && await dailyReportsSentToday()) {
    return NextResponse.json({ ok: true, skipped: 'already sent today' });
  }
  const r = await sendAllDailyReports();
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

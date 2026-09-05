import { NextResponse } from 'next/server';
import { requireCron } from '@/lib/api';
import { sendEaReport } from '@/lib/eaReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Executive Assistant evening report (Walk-in + Payments) — see lib/eaReport.js.
//
// This route is the manual / external-cron entry point. The report normally
// goes out on its own from the in-app scheduler (lib/scheduler.js) at 7 PM
// IST Mon–Sat, so no host cron is required any more; hitting this route
// sends it again on demand.
//
// Same auth as the other reminder routes: Authorization: Bearer <CRON_SECRET>
// (or ?secret=<DEVELOPER_SECRET> for manual testing).
export async function GET(req) {
  const gate = requireCron(req); if (gate) return gate;
  const r = await sendEaReport();
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}

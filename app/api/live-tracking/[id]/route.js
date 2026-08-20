import { NextResponse } from 'next/server';
import { currentUser, currentUserIsAdmin, redactSheetIds, requireAdmin, requireUser } from '@/lib/api';
import { deleteLiveTracker, getLiveTracker, getLiveTrackerData, updateLiveTracker } from '@/lib/liveTracking';
import { branchScopeFor, detectColumns, rowInBranchScope } from '@/lib/liveTrackingView';
import { isSheetTimeout } from '@/lib/fmsSheet';

// Config + a fresh live read of the connected tab — open to any signed-in
// user (that's the whole point: browsing the live data), editing stays admin-only.
export async function GET(req, { params }) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const { id } = await params;
    const tracker = await getLiveTracker(id);
    if (!tracker) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const data = await getLiveTrackerData(tracker);
    // Admin-only right: without the sheet id there's no "Open in Sheets" link
    // to build. Only the tracker is redacted — `data.rows` is the live sheet
    // content this page exists to show, and can run to thousands of rows.
    const shown = redactSheetIds(tracker, await currentUserIsAdmin());

    // Branch users only ever see their own branch's rows. Cut here rather than
    // in the table, so the other branch's data never leaves the server — and
    // so the priority breakdown and the row counts agree with what is shown.
    const scope = branchScopeFor(await currentUser());
    if (scope) {
      const { branchIdx } = detectColumns(data.headers, data.rows);
      const rows = data.rows.filter((r) => rowInBranchScope(r, branchIdx, scope));
      return NextResponse.json({
        tracker: shown, ...data, rows,
        scope: { branches: scope, hidden: data.rows.length - rows.length },
      });
    }
    return NextResponse.json({ tracker: shown, ...data });
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 403) return NextResponse.json({ error: 'Access denied. Share the sheet with the service account.' }, { status: 400 });
    if (code === 404) return NextResponse.json({ error: 'Sheet or tab not found. Check the link and tab name.' }, { status: 400 });
    // Google didn't answer in time (already retried once). Nothing is wrong
    // with the link or the sharing — say so, instead of leaking the raw
    // "The operation was aborted." under a permissions hint.
    if (isSheetTimeout(err)) {
      return NextResponse.json({
        error: 'Google Sheets took too long to answer. The tab is reachable — it is just big, or Google is slow right now. Hit Refresh to try again.',
        timeout: true,
      }, { status: 504 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { id } = await params;
    const body = await req.json();
    if (!body.name?.trim())      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!body.sheetLink?.trim()) return NextResponse.json({ error: 'Google Sheet link is required' }, { status: 400 });
    if (!body.sheetName?.trim()) return NextResponse.json({ error: 'Sheet tab name is required' }, { status: 400 });
    const tracker = await getLiveTracker(id);
    if (!tracker) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await updateLiveTracker(id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { id } = await params;
    await deleteLiveTracker(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

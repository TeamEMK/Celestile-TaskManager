import { NextResponse } from 'next/server';
import { currentUser, currentUserIsAdmin, redactSheetIds, requireAdmin, requireUser, requireUserCtx } from '@/lib/api';
import { deleteLiveTracker, getLiveTracker, getLiveTrackerData, setLiveTrackerCell, updateLiveTracker } from '@/lib/liveTracking';
import { branchScopeFor, detectColumns, rowInBranchScope, PROGRAM_SENT_OPTIONS } from '@/lib/liveTrackingView';
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

    // Branch users only ever see their own branch's rows — which branch a row
    // belongs to is read off its order number (H… Hyderabad, B… Bangalore).
    // Cut here rather than in the table, so the other branch's data never
    // leaves the server — and so the priority breakdown and the row counts
    // agree with what is shown.
    const scope = branchScopeFor(await currentUser());
    if (scope) {
      const cols = detectColumns(data.headers, data.rows);
      const keep = data.rows.map((r) => rowInBranchScope(r, cols, scope));
      const rows = data.rows.filter((_, i) => keep[i]);
      const rowNumbers = data.rowNumbers.filter((_, i) => keep[i]);
      // `data.fileLinks` is deliberately NOT cut down to the visible rows:
      // the drawings are meant to be openable by everyone, and /api/drive
      // serves them to any signed-in user for the same reason. It is the
      // order rows that are branch-private, not the drawings attached to them.
      return NextResponse.json({
        tracker: shown, ...data, rows, rowNumbers,
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
    console.error('[live-tracking/[id] GET]', err.message);
    return NextResponse.json({ error: 'Failed to load live tracker data' }, { status: 500 });
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
    console.error('[live-tracking/[id] PUT]', err.message);
    return NextResponse.json({ error: 'Failed to update live tracker' }, { status: 500 });
  }
}

// Set "Program file sent" on one row, straight into the sheet. Open to any
// signed-in user who can see that row — it is order data, not tracker
// config — but only that column, and only Yes / No.
export async function PATCH(req, { params }) {
  const { gate, user } = await requireUserCtx(); if (gate) return gate;
  try {
    const { id } = await params;
    const { rowNumber, value, order } = await req.json();
    const rowNum = parseInt(rowNumber);
    if (!PROGRAM_SENT_OPTIONS.includes(value)) return NextResponse.json({ error: 'Value must be Yes or No' }, { status: 400 });
    const tracker = await getLiveTracker(id);
    if (!tracker) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const firstData = (parseInt(tracker.header_row) || 1) + 1;
    if (!rowNum || rowNum < firstData) return NextResponse.json({ error: 'Invalid row' }, { status: 400 });

    const data = await getLiveTrackerData(tracker);
    const cols = detectColumns(data.headers, data.rows);
    if (cols.programSentIdx < 0) return NextResponse.json({ error: 'This sheet has no "Program file sent" column' }, { status: 400 });
    // A branch user may only touch rows the GET would have shown them.
    const current = data.rows[data.rowNumbers.indexOf(rowNum)];
    const scope = branchScopeFor(user);
    if (!current || !rowInBranchScope(current, cols, scope)) {
      return NextResponse.json({ error: 'You cannot edit this row' }, { status: 403 });
    }

    const row = await setLiveTrackerCell(tracker, {
      rowNumber: rowNum, colIdx: cols.programSentIdx, value,
      orderIdx: cols.orderIdx, expectOrder: order,
    }).catch((err) => { if (err.status === 409) return err; throw err; });
    if (row instanceof Error) return NextResponse.json({ error: row.message }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[live-tracking/[id] PATCH]', err.message);
    return NextResponse.json({ error: 'Failed to update the sheet' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { id } = await params;
    await deleteLiveTracker(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[live-tracking/[id] DELETE]', err.message);
    return NextResponse.json({ error: 'Failed to delete live tracker' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireAdmin, requireUser, currentUser, currentUserIsAdmin, redactSheetIds } from '@/lib/api';
import { createLiveTracker, listLiveTrackers } from '@/lib/liveTracking';
import { listFmsLiveViews } from '@/lib/fmsSheet';

// Any signed-in user can view the list of connected sheets; only admins can
// wire up a new one (below).
export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const list = await listLiveTrackers();
    const isAdmin = await currentUserIsAdmin();
    // Every FMS flow the user can see also gets a live view — where each
    // entry stands step-wise. Read-only and built from the FMS config, so
    // there's nothing to connect; a failure here must not hide the sheets.
    let fmsViews = [];
    try {
      const user = await currentUser();
      fmsViews = (await listFmsLiveViews(user?.id, isAdmin))
        .map((f) => ({ id: `fms-${f.id}`, name: f.name, sheet_id: f.sheet_id, kind: 'fms' }));
    } catch (err) { console.error('[live-tracking GET] fms views:', err.message); }
    // Opening the sheet itself is admin-only, so a plain user never receives
    // the id the "Open in Sheets" link would be built from.
    return NextResponse.json(redactSheetIds([...list, ...fmsViews], isAdmin));
  } catch (err) {
    console.error('[live-tracking GET]', err.message);
    return NextResponse.json({ error: 'Failed to load live trackers' }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const body = await req.json();
    if (!body.name?.trim())      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!body.sheetLink?.trim()) return NextResponse.json({ error: 'Google Sheet link is required' }, { status: 400 });
    if (!body.sheetName?.trim()) return NextResponse.json({ error: 'Sheet tab name is required' }, { status: 400 });
    const user = await currentUser();
    const id = await createLiveTracker({
      name: body.name, sheetLink: body.sheetLink, sheetName: body.sheetName,
      headerRow: body.headerRow, startRow: body.startRow, createdBy: user?.id,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error('[live-tracking POST]', err.message);
    return NextResponse.json({ error: 'Failed to create live tracker' }, { status: 500 });
  }
}

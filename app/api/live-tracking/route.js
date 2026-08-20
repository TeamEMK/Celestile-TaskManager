import { NextResponse } from 'next/server';
import { requireAdmin, requireUser, currentUser, currentUserIsAdmin, redactSheetIds } from '@/lib/api';
import { createLiveTracker, listLiveTrackers } from '@/lib/liveTracking';

// Any signed-in user can view the list of connected sheets; only admins can
// wire up a new one (below).
export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const list = await listLiveTrackers();
    // Opening the sheet itself is admin-only, so a plain user never receives
    // the id the "Open in Sheets" link would be built from.
    return NextResponse.json(redactSheetIds(list, await currentUserIsAdmin()));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

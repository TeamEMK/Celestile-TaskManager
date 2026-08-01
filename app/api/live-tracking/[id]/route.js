import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/lib/api';
import { deleteLiveTracker, getLiveTracker, getLiveTrackerData, updateLiveTracker } from '@/lib/liveTracking';

// Config + a fresh live read of the connected tab — open to any signed-in
// user (that's the whole point: browsing the live data), editing stays admin-only.
export async function GET(req, { params }) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const { id } = await params;
    const tracker = await getLiveTracker(id);
    if (!tracker) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const data = await getLiveTrackerData(tracker);
    return NextResponse.json({ tracker, ...data });
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 403) return NextResponse.json({ error: 'Access denied. Share the sheet with the service account.' }, { status: 400 });
    if (code === 404) return NextResponse.json({ error: 'Sheet or tab not found. Check the link and tab name.' }, { status: 400 });
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

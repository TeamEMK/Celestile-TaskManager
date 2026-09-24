import { NextResponse } from 'next/server';
import { requireUserCtx } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { getFmsSheet, getPendingAcrossSteps } from '@/lib/fmsSheet';

export async function GET(req, { params }) {
  const { gate, user: sessionUser } = await requireUserCtx(); if (gate) return gate;
  try {
    const { id } = await params;
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });

    // PC View is a cross-step monitoring view (pending items across every
    // step, not scoped to one doer) — restrict it to admins and the FMS's
    // configured process coordinator, same as every other FMS route that
    // exposes more than a caller's own assigned work.
    const isAdmin = isAdminRoles(sessionUser.roles);
    const isCoordinator = sheet.process_coordinator_id && String(sheet.process_coordinator_id) === String(sessionUser.id);
    if (!isAdmin && !isCoordinator) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const items = await getPendingAcrossSteps(id);
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[fms pc GET]', err.message);
    return NextResponse.json({ error: 'Failed to load PC view' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireUser, currentUser } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { getFmsSheet, getFullSteps, getPendingRowsForStep } from '@/lib/fmsSheet';

// Live pending rows (Plan filled + Actual empty) for one step, doer-filtered
// for non-admins.
export async function GET(req, { params }) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const { id, stepId } = await params;
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const steps = await getFullSteps(id);
    const step = steps.find((s) => String(s.id) === String(stepId));
    if (!step) return NextResponse.json({ error: 'Step not found' }, { status: 404 });

    const user = await currentUser();
    const result = await getPendingRowsForStep({ sheet, step, userName: user.name, isAdmin: isAdminRoles(user.roles) });
    return NextResponse.json(result);
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 403) return NextResponse.json({ error: 'Access denied to the sheet.' }, { status: 400 });
    if (code === 404) return NextResponse.json({ error: 'Sheet not found.' }, { status: 400 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

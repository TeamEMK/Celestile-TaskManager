import { NextResponse } from 'next/server';
import { requireUserCtx } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { getFmsSheet, getFullSteps, assignStepDoer } from '@/lib/fmsSheet';

// Names the doer for one pending row of an "assigned" step (a step whose
// doer is chosen at run time rather than fixed in config). Writes the chosen
// person's name into the step's Doer Name column; from then on the row shows
// up on that person's Dashboard only. Assigners can call this again to
// reassign — the cell is simply overwritten.
export async function POST(req, { params }) {
  const { gate, user } = await requireUserCtx(); if (gate) return gate;
  try {
    const { id, stepId } = await params;
    const { rowNumber, userId } = await req.json();
    if (!rowNumber) return NextResponse.json({ error: 'rowNumber required' }, { status: 400 });
    if (!userId)    return NextResponse.json({ error: 'Pick who should do this step' }, { status: 400 });

    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const steps = await getFullSteps(id);
    const step = steps.find((s) => String(s.id) === String(stepId));
    if (!step) return NextResponse.json({ error: 'Step not found' }, { status: 404 });

    const isAdmin = isAdminRoles(user.roles);
    const isAssigner = (step.assigners || []).some((a) => String(a.user_id) === String(user.id));
    if (!isAdmin && !isAssigner) {
      return NextResponse.json({ error: 'You are not allowed to assign this step' }, { status: 403 });
    }
    if (!step.doer_name_col) {
      return NextResponse.json({ error: 'This step has no Doer Name column configured — set one in the FMS editor first' }, { status: 400 });
    }

    const result = await assignStepDoer({ sheet, step, rowNumber, userId, assignedBy: user });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 403) return NextResponse.json({ error: 'Access denied. Sheet write permission needed.' }, { status: 400 });
    if (err.status === 400) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

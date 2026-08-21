import { NextResponse } from 'next/server';
import { requireUser, currentUser } from '@/lib/api';
import { getFmsSheet, getFullSteps, writeStepDone } from '@/lib/fmsSheet';

// Writes the Actual timestamp (+ delay reason + extra fields + doer name)
// back to the exact cells of the live Google Sheet.
export async function POST(req, { params }) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const { id, stepId } = await params;
    const { rowNumber, delayReason, extraInputs } = await req.json();
    if (!rowNumber) return NextResponse.json({ error: 'rowNumber required' }, { status: 400 });

    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const steps = await getFullSteps(id);
    const step = steps.find((s) => String(s.id) === String(stepId));
    if (!step) return NextResponse.json({ error: 'Step not found' }, { status: 404 });

    const user = await currentUser();
    const result = await writeStepDone({
      sheet, step, rowNumber, delayReason, extraInputs, doerName: user?.name || '',
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 403) return NextResponse.json({ error: 'Access denied. Sheet write permission needed.' }, { status: 400 });
    if (err.message?.startsWith('Order number')) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

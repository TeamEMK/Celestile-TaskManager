import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/api';
import { LEAVE_TYPES, readApprovers, saveApprovers, readQuotas, saveQuotas } from '@/lib/leaves';

// Quotas + department->approver routing. Read by anyone signed in (the apply
// form shows remaining balance; an HOD needs to see who's routed where);
// only an admin may change either.
export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const [approvers, quotas] = await Promise.all([readApprovers(), readQuotas()]);
    return NextResponse.json({ approvers, quotas, types: LEAVE_TYPES });
  } catch (err) {
    console.error('[leaves/settings GET]', err.message);
    return NextResponse.json({ error: 'Failed to load leave settings' }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (body.approvers && typeof body.approvers === 'object' && !Array.isArray(body.approvers)) {
      await saveApprovers(body.approvers);
    }
    if (body.quotas && typeof body.quotas === 'object') {
      await saveQuotas(body.quotas);
    }
    const [approvers, quotas] = await Promise.all([readApprovers(), readQuotas()]);
    return NextResponse.json({ approvers, quotas, types: LEAVE_TYPES });
  } catch (err) {
    console.error('[leaves/settings POST]', err.message);
    return NextResponse.json({ error: 'Failed to save leave settings' }, { status: 500 });
  }
}

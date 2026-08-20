import { NextResponse } from 'next/server';
import { requireUser, currentUser, redactSheetIds } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { getFmsSheet, getStepsForTaskView } from '@/lib/fmsSheet';

export async function GET(req, { params }) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const { id } = await params;
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const user = await currentUser();
    const steps = await getStepsForTaskView(id, user.id, isAdminRoles(user.roles));
    return NextResponse.json({ sheet: redactSheetIds(sheet, isAdminRoles(user.roles)), steps });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

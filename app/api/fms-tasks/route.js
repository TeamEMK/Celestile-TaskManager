import { NextResponse } from 'next/server';
import { requireUser, currentUser } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { getFmsSheetsForUser } from '@/lib/fmsSheet';

// FMS sheets visible to the caller — admin sees all, everyone else only
// sheets where they're a doer on at least one step.
export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const user = await currentUser();
    const sheets = await getFmsSheetsForUser(user.id, isAdminRoles(user.roles));
    return NextResponse.json(sheets);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

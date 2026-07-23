import { NextResponse } from 'next/server';
import { requireAdmin, requireUser, currentUser } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { createFmsSheet, getFmsSheetsWithStats } from '@/lib/fmsSheet';

// Any signed-in user can browse (admins see every FMS, everyone else only
// flows they're a doer on) — editing/creating stays admin-only below.
export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const user = await currentUser();
    const sheets = await getFmsSheetsWithStats(user.id, isAdminRoles(user.roles));
    return NextResponse.json(sheets);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const body = await req.json();
    if (!body.sheetName?.trim()) return NextResponse.json({ error: 'Sheet Tab Name required' }, { status: 400 });
    if (!body.sheetId?.trim())   return NextResponse.json({ error: 'Google Sheet ID required' }, { status: 400 });
    const user = await currentUser();
    const id = await createFmsSheet({
      fmsName: body.fmsName, sheetName: body.sheetName, sheetId: body.sheetId,
      headerRow: body.headerRow, createdBy: user?.id, steps: body.steps || [],
      processCoordinatorId: body.processCoordinatorId || null,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

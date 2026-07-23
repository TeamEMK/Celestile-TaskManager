import { NextResponse } from 'next/server';
import { requireAdmin, currentUser } from '@/lib/api';
import { listFmsSheets, createFmsSheet } from '@/lib/fmsSheet';

export async function GET() {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const sheets = await listFmsSheets();
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

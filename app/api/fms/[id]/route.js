import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { getFmsSheet, getFullSteps, updateFmsSheet, deleteFmsSheet } from '@/lib/fmsSheet';

export async function GET(req, { params }) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { id } = await params;
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const steps = await getFullSteps(id);
    return NextResponse.json({ sheet, steps });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { id } = await params;
    const body = await req.json();
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    await updateFmsSheet(id, {
      fmsName: body.fmsName, sheetName: body.sheetName, sheetId: body.sheetId,
      headerRow: body.headerRow, steps: body.steps || [],
      processCoordinatorId: body.processCoordinatorId || null,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { id } = await params;
    await deleteFmsSheet(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

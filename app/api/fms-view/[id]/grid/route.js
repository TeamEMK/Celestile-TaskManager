import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api';
import { getFmsSheet, getSheetGridData } from '@/lib/fmsSheet';

export async function GET(req, { params }) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const { id } = await params;
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const grid = await getSheetGridData(sheet);
    return NextResponse.json(grid);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

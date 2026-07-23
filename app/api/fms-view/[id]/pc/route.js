import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api';
import { getFmsSheet, getPendingAcrossSteps } from '@/lib/fmsSheet';

export async function GET(req, { params }) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const { id } = await params;
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const items = await getPendingAcrossSteps(id);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

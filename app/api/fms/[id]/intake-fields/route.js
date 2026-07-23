import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { getFmsSheet, getIntakeFields, saveIntakeFields } from '@/lib/fmsSheet';

export async function GET(req, { params }) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { id } = await params;
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const fields = await getIntakeFields(id);
    return NextResponse.json({ fields });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { id } = await params;
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const body = await req.json();
    await saveIntakeFields(id, body.fields || []);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

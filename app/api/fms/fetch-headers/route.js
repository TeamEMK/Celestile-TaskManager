import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { fetchHeaders } from '@/lib/fmsSheet';

// Header row only — fast even for huge sheets, used to populate column
// pickers while configuring a step (Plan/Actual/etc.).
export async function POST(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { sheetId, sheetName, headerRow } = await req.json();
    if (!sheetId) return NextResponse.json({ error: 'sheetId required' }, { status: 400 });
    const headers = await fetchHeaders(sheetId, sheetName, headerRow);
    return NextResponse.json({ headers });
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 403) return NextResponse.json({ error: 'Access denied. Share the sheet with the service account.' }, { status: 400 });
    if (code === 404) return NextResponse.json({ error: 'Sheet not found. Check the Sheet ID.' }, { status: 400 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

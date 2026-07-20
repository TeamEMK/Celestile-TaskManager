import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { sheetColumnValues } from '@/lib/fmsSheet';

// Unique values from a sheet column, matched against `users` — powers
// "Load Doers" in the step config (auto-fill Step Doers from a column).
export async function GET(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { searchParams } = new URL(req.url);
    const sheetId   = searchParams.get('sheetId');
    const tabName   = searchParams.get('tabName') || 'Sheet1';
    const col       = searchParams.get('col');
    const headerRow = searchParams.get('headerRow');
    if (!sheetId || !col) return NextResponse.json({ error: 'sheetId and col required' }, { status: 400 });
    const result = await sheetColumnValues(sheetId, tabName, col, headerRow);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

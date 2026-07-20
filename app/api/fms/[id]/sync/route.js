import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { getFmsSheet, fetchRange } from '@/lib/fmsSheet';

// Full sheet fetch — lets the admin confirm the sheet is reachable and see
// row/column counts after configuring a step.
export async function GET(req, { params }) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { id } = await params;
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const headerRowIdx = (sheet.header_row || 1) - 1;
    const allRows = await fetchRange(sheet.sheet_id, sheet.sheet_name);
    if (allRows.length <= headerRowIdx) {
      return NextResponse.json({ error: `Sheet has only ${allRows.length} rows but header row is set to ${sheet.header_row}` }, { status: 400 });
    }
    const headers = allRows[headerRowIdx].filter((h) => h && h.trim());
    const dataRows = allRows.slice(headerRowIdx + 1);
    return NextResponse.json({ success: true, headers, totalRows: dataRows.length, headerRow: sheet.header_row });
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 403) return NextResponse.json({ error: 'Access denied. Share the sheet with the service account.' }, { status: 400 });
    if (code === 404) return NextResponse.json({ error: 'Sheet not found. Check the Sheet ID.' }, { status: 400 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api';
import { getQuotationMaster, addQuotationMasterItem, explainMasterError, MASTER_SHEET_ID } from '@/lib/quotationMaster';

// Item + thickness options for the quotation forms, read live from the team's
// master spreadsheet. A failure here is never fatal: we answer 200 with empty
// lists plus the reason, and the form keeps its built-in fallback list.
export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const { items, thicknesses, thicknessByItem, tab } = await getQuotationMaster();
    return NextResponse.json({ items, thicknesses, thicknessByItem, tab, sheetId: MASTER_SHEET_ID });
  } catch (err) {
    console.error('[api/quotations/master]', err.message);
    return NextResponse.json({ items: [], thicknesses: [], thicknessByItem: {}, error: explainMasterError(err) });
  }
}

// "+ Add new item" — appends to the same sheet so the master stays one place.
export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const { item, thickness } = await req.json();
    const result = await addQuotationMasterItem(item, thickness);
    const { items, thicknesses, thicknessByItem } = await getQuotationMaster(true);
    return NextResponse.json({ ...result, items, thicknesses, thicknessByItem });
  } catch (err) {
    console.error('[api/quotations/master POST]', err.message);
    return NextResponse.json({ error: explainMasterError(err) }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import { requireAccess, currentUser } from '@/lib/api';
import { getFmsSheet, getIntakeFields, submitIntakeRow, effectiveIntakeSheet } from '@/lib/fmsSheet';

// GET the configured intake-form fields, for rendering the "+ New Entry" form.
export async function GET(req, { params }) {
  const gate = await requireAccess('fms-intake'); if (gate) return gate;
  try {
    const { id } = await params;
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const fields = await getIntakeFields(id);
    return NextResponse.json({ fields, formName: sheet.intake_form_name || '' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Validate + append a brand-new row to the FMS's connected Google Sheet.
export async function POST(req, { params }) {
  const gate = await requireAccess('fms-intake'); if (gate) return gate;
  try {
    const { id } = await params;
    const { values } = await req.json();
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const fields = await getIntakeFields(id);
    if (!fields.length) return NextResponse.json({ error: 'No intake form configured for this FMS' }, { status: 400 });

    const user = await currentUser();
    await submitIntakeRow(effectiveIntakeSheet(sheet), fields, values || {}, { userName: user?.name || '' });
    return NextResponse.json({ success: true });
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 403) return NextResponse.json({ error: 'Access denied. Sheet write permission needed.' }, { status: 400 });
    if (err.message?.startsWith('Required field')) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

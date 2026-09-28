import { NextResponse } from 'next/server';
import { requireAccess, currentUser } from '@/lib/api';
import { getFmsSheet, getIntakeFields, submitIntakeRow, effectiveIntakeSheet, isSheetTimeout } from '@/lib/fmsSheet';

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
    const result = await submitIntakeRow(effectiveIntakeSheet(sheet), fields, values || {}, { userName: user?.name || '' });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 403) return NextResponse.json({ error: 'Access denied. Sheet write permission needed.' }, { status: 400 });
    if (err.message?.startsWith('Required field')) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err.message?.startsWith('Order number'))   return NextResponse.json({ error: err.message }, { status: 400 });
    // Already entered. 409 rather than 400: nothing about the request is
    // malformed, it just collides with a row that is already there.
    if (err.duplicate) {
      return NextResponse.json({
        error: err.message,
        duplicate: { fieldId: err.duplicate.field?.id, label: err.duplicate.label, row: err.duplicate.row },
      }, { status: 409 });
    }
    // Google didn't answer in time (already retried once) — say so plainly
    // instead of leaking the raw "The operation was aborted." under no
    // explanation. This can time out on the write itself, so it can't
    // promise the row wasn't saved — only that we never got confirmation.
    if (isSheetTimeout(err)) {
      return NextResponse.json({
        error: 'Google Sheets took too long to answer. It is reachable — just slow right now (often because several people are submitting at once). Check the sheet before retrying, in case it actually saved right as the connection timed out.',
        timeout: true,
      }, { status: 504 });
    }

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

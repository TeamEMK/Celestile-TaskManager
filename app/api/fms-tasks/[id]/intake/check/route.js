import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/api';
import { getFmsSheet, getIntakeFields, findIntakeDuplicate, duplicateMessage, effectiveIntakeSheet } from '@/lib/fmsSheet';

/**
 * "Has this number already been entered?" — asked by the form as soon as the
 * field is filled in, so someone finds out before typing the rest of the
 * enquiry rather than after submitting it.
 *
 * Advisory only. The submit route checks again with the write lock held
 * (submitIntakeRow), which is what actually decides — this one can be stale by
 * the time Submit is pressed, and a form that only warned would let a
 * duplicate through on a slow tab.
 */
export async function POST(req, { params }) {
  const gate = await requireAccess('fms-intake'); if (gate) return gate;
  try {
    const { id } = await params;
    const { values } = await req.json();
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });
    const fields = await getIntakeFields(id);
    const dup = await findIntakeDuplicate(effectiveIntakeSheet(sheet), fields, values || {});
    if (!dup) return NextResponse.json({ duplicate: null });
    return NextResponse.json({
      duplicate: { fieldId: dup.field.id, label: dup.label, row: dup.row, message: duplicateMessage(dup) },
    });
  } catch (err) {
    // A lookup that fails is not a duplicate — say nothing and let the submit
    // route be the one to refuse. Warning on an error would block real entries.
    return NextResponse.json({ duplicate: null, warning: err.message });
  }
}

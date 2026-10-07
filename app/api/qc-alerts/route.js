import { requireAdmin, requireAccess, currentUser, json, fail } from '@/lib/api';
import { listQcAlerts, raiseQcAlert } from '@/lib/qcAlerts';
import { maybeUploadToDriveWithLink } from '@/lib/googleDrive';

// The rework record — every O2D checklist alert, newest first. Admin only:
// it names who raised what against whom.
export async function GET() {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    return json(await listQcAlerts());
  } catch (err) {
    console.error('[qc-alerts GET]', err.message);
    return fail('Failed to load alerts', 500);
  }
}

// Raised by the inventory Step 2 checklist (FMS step checklists raise theirs
// server-side inside writeStepDone, so they never come through here).
export async function POST(req) {
  const gate = await requireAccess('/inventory'); if (gate) return gate;
  try {
    const b = await req.json();
    if (!b.check || !b.answer || !b.to) return fail('check, answer and to are required');
    const user = await currentUser();
    const photo = b.photo ? await maybeUploadToDriveWithLink(b.photo, 'qc-alert') : '';
    const result = await raiseQcAlert({
      source: b.source || 'Factory O2D', stepName: b.stepName || '',
      orderNo: String(b.orderNo || '').trim(), area: b.area || '', material: b.material || '',
      check: b.check, answer: b.answer, note: b.note || '',
      photo: typeof photo === 'string' && !photo.startsWith('data:') ? photo : '',
      to: b.to, raisedBy: user?.name || '', raisedById: user?.id || null,
    });
    return json({ ok: true, ...result });
  } catch (err) {
    console.error('[qc-alerts POST]', err.message);
    return fail('Failed to raise alert', 500);
  }
}

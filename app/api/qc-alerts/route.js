import { requireAdmin, json, fail } from '@/lib/api';
import { listQcAlerts } from '@/lib/qcAlerts';

// The rework record — every O2D checklist alert, newest first. Admin only:
// it names who raised what against whom. Alerts themselves are raised
// server-side by writeStepDone when an FMS checklist answer trips one.
export async function GET() {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    return json(await listQcAlerts());
  } catch (err) {
    console.error('[qc-alerts GET]', err.message);
    return fail('Failed to load alerts', 500);
  }
}

import { requireAdmin, json, fail } from '@/lib/api';
import { listRevisions } from '@/lib/revisions';

// Every design send-back, newest first — the weekly revision report.
// Admin only: it names whose work went back and why.
export async function GET() {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    return json(await listRevisions());
  } catch (err) {
    console.error('[revisions GET]', err.message);
    return fail('Failed to load revisions', 500);
  }
}

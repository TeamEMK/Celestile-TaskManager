import { requireUser, json, fail } from '@/lib/api';
import { workerHours, orderTracking } from '@/lib/production';

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// ?type=workers | orders, over a date range.
export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const q = new URL(req.url).searchParams;
    const from = q.get('from'), to = q.get('to');
    if (!isDate(from) || !isDate(to)) return fail('from and to must be YYYY-MM-DD');

    if (q.get('type') === 'orders') {
      return json(await orderTracking({ from, to, order: q.get('order') || '' }));
    }
    return json(await workerHours({ from, to, departmentId: q.get('departmentId') || '' }));
  } catch (err) {
    return fail(err.message, 500);
  }
}

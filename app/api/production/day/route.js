import { requireUser, currentUser, json, fail } from '@/lib/api';
import { getDayReport, saveBlock, filledDates } from '@/lib/production';

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// One day's whole report: every department's block plus its notes.
// `?from=&to=` instead returns which dates in that window already have entries.
export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const q = new URL(req.url).searchParams;
    const from = q.get('from'), to = q.get('to');
    if (isDate(from) && isDate(to)) return json(await filledDates({ from, to }));

    const date = q.get('date');
    if (!isDate(date)) return fail('date must be YYYY-MM-DD');
    return json(await getDayReport(date));
  } catch (err) {
    return fail(err.message, 500);
  }
}

// Saves one department+shift block, replacing whatever was there.
export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const user = await currentUser();
    const body = await req.json();
    if (!isDate(body.date)) return fail('date must be YYYY-MM-DD');
    if (!body.departmentId)  return fail('departmentId is required');
    const res = await saveBlock({
      date: body.date,
      departmentId: body.departmentId,
      shift: body.shift || '',
      rows: Array.isArray(body.rows) ? body.rows : [],
      note: body.note || '',
      userId: user?.id || null,
    });
    return json(res);
  } catch (err) {
    return fail(err.message, 500);
  }
}

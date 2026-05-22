import { NextResponse } from 'next/server';
import { readStore, FMS_STEPS } from '@/lib/store';

export async function GET(req) {
  const url = new URL(req.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const type = url.searchParams.get('type') || 'Delegation MIS';
  if (!start || !end) return NextResponse.json({ error: 'start, end required' }, { status: 400 });

  const store = await readStore();
  const from = new Date(start);
  const to = new Date(end);
  to.setHours(23, 59, 59);

  const inRange = (iso) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= from && d <= to;
  };

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN') : '';

  let rows = [];
  let summary = {};

  if (type === 'Delegation MIS' || type === 'All MIS') {
    const delRows = (store.delegations || [])
      .filter((d) => inRange(d.createdAt))
      .map((d) => ({
        Type: 'Delegation',
        ID: d.id,
        Description: d.description.substring(0, 80),
        Doer: d.doer,
        'Due Date': fmtDate(d.dueDate),
        Client: d.client || '-',
        Status: d.status,
        'Created At': fmtDate(d.createdAt),
      }));
    rows = rows.concat(delRows);
  }

  if (type === 'FMS MIS' || type === 'All MIS') {
    const fmsRows = [];
    (store.fms || []).forEach((entry) => {
      entry.steps.forEach((s, i) => {
        if (inRange(s.planned) || inRange(s.actual)) {
          fmsRows.push({
            Type: 'FMS',
            ID: entry.id + '-S' + (i + 1),
            Client: entry.clientName,
            Step: FMS_STEPS[i].name,
            Doer: entry.doer || '-',
            'Planned': fmtDate(s.planned),
            'Actual': fmtDate(s.actual),
            Status: s.actual ? 'Done' : (new Date(s.planned) < new Date() ? 'Delayed' : 'Pending'),
          });
        }
      });
    });
    rows = rows.concat(fmsRows);
  }

  if (type === 'Checklist MIS') {
    rows = (store.masters || []).map((m) => ({
      ID: m.id,
      Task: m.task,
      'Assigned To': m.assignedTo,
      Frequency: m.frequency,
      'Created At': fmtDate(m.createdAt),
    }));
  }

  summary = {
    Total: rows.length,
    From: fmtDate(from.toISOString()),
    To: fmtDate(to.toISOString()),
  };
  if (type === 'Delegation MIS' || type === 'All MIS') {
    summary['Completed'] = rows.filter((r) => r.Status === 'done' || r.Status === 'Done').length;
    summary['Pending'] = rows.filter((r) => r.Status === 'pending' || r.Status === 'Pending' || r.Status === 'Delayed').length;
  }

  return NextResponse.json({ rows, summary });
}

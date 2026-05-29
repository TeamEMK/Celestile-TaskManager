import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

export const maxDuration = 30;

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export async function GET(req) {
  await ensureSchema();
  const url      = new URL(req.url);
  const start    = url.searchParams.get('start');
  const end      = url.searchParams.get('end');
  const type     = url.searchParams.get('type') || 'Delegation MIS';
  const employee = url.searchParams.get('employee');

  if (!start || !end)
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });

  const from    = new Date(start);
  const to      = new Date(end); to.setHours(23, 59, 59);
  const now     = new Date();
  const fromISO = from.toISOString();
  const toISO   = to.toISOString();

  // Drill-down: single employee
  if (employee && (type === 'Delegation MIS' || type === 'All MIS')) {
    const [data] = await pool.query(
      `SELECT id, description, client, due_date, priority, status FROM delegations
       WHERE doer = ? AND (due_date BETWEEN ? AND ? OR created_at BETWEEN ? AND ?)
       ORDER BY due_date ASC`,
      [employee, fromISO, toISO, fromISO, toISO]
    );
    const rows = data.map((d, i) => ({
      '#': i + 1, 'Description': (d.description || '').substring(0, 100),
      'Client': d.client || '—', 'Due Date': fmtDate(d.due_date),
      'Priority': d.priority || 'Low', 'Status': d.status || '—',
    }));
    return NextResponse.json({ rows, summary: {} });
  }

  // Delegation MIS
  if (type === 'Delegation MIS' || type === 'All MIS') {
    const [data] = await pool.query(
      `SELECT doer, status, due_date FROM delegations
       WHERE due_date BETWEEN ? AND ? OR created_at BETWEEN ? AND ?
       ORDER BY doer ASC`,
      [fromISO, toISO, fromISO, toISO]
    );

    const empMap = {};
    for (const t of data) {
      const name = t.doer || 'Unknown';
      if (!empMap[name]) empMap[name] = { name, total: 0, completed: 0, pending: 0, revised: 0, delayed: 0 };
      const e = empMap[name]; e.total++;
      if (t.status === 'done') {
        e.completed++;
      } else if (t.status === 'revise' || t.status === 'revise_requested') {
        e.revised++; e.pending++;
        if (t.due_date && new Date(t.due_date) < now) e.delayed++;
      } else {
        e.pending++;
        if (t.due_date && new Date(t.due_date) < now) e.delayed++;
      }
    }

    const rows = Object.values(empMap).map((e) => ({
      ...e, score: e.total > 0 ? Math.round(((e.completed / e.total) - 1) * 100 - (e.delayed / e.total) * 50) : 0,
    }));
    const summary = {
      'Total Tasks': data.length, 'Employees': rows.length,
      'Completed': data.filter((d) => d.status === 'done').length,
      'Pending': data.filter((d) => d.status !== 'done').length,
      'Delayed': data.filter((d) => d.status !== 'done' && d.due_date && new Date(d.due_date) < now).length,
      'Period': `${fmtDate(fromISO)} – ${fmtDate(toISO)}`,
    };
    return NextResponse.json({ rows, summary, view: 'employee' });
  }

  // Checklist MIS
  if (type === 'Checklist MIS') {
    const [[masters], [completions]] = await Promise.all([
      pool.query('SELECT id, task, assigned_to, frequency FROM masters ORDER BY assigned_to, id'),
      pool.query('SELECT master_id FROM checklist_completions WHERE date BETWEEN ? AND ?', [start, end])
        .catch(() => [[]]),
    ]);

    const doneSet = {};
    for (const c of completions) doneSet[c.master_id] = (doneSet[c.master_id] || 0) + 1;

    const empMap = {};
    for (const m of masters) {
      const name = m.assigned_to || 'Unknown';
      if (!empMap[name]) empMap[name] = { name, total: 0, completed: 0, pending: 0, revised: 0, delayed: 0 };
      empMap[name].total++;
      if (doneSet[m.id] > 0) empMap[name].completed++;
      else empMap[name].pending++;
    }

    const rows = Object.values(empMap).map((e) => ({
      ...e, score: e.total > 0 ? Math.round(((e.completed / e.total) - 1) * 100) : 0,
    }));
    const summary = {
      'Total Checklists': masters.length, 'Employees': rows.length,
      'Completions': completions.length, 'Period': `${fmtDate(fromISO)} – ${fmtDate(toISO)}`,
    };
    return NextResponse.json({ rows, summary, view: 'employee' });
  }

  return NextResponse.json({ rows: [], summary: {} });
}

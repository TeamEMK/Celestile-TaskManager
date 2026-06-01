import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { readStore } from '@/lib/store';

export const maxDuration = 30;

const hasDB = !!process.env.DB_HOST;

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export async function GET(req) {
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
  // MySQL-compatible datetime strings (no T/Z — older MySQL versions reject ISO format)
  const fromDT  = start + ' 00:00:00';
  const toDT    = end   + ' 23:59:59';

  try {
    if (!hasDB) {
      // JSON store fallback
      const store = await readStore();

      // Drill-down: single employee
      if (employee && (type === 'Delegation MIS' || type === 'All MIS')) {
        const data = (store.delegations || []).filter((d) => {
          if (d.doer !== employee) return false;
          const due = d.dueDate ? new Date(d.dueDate) : null;
          if (due) return due >= from && due <= to;
          return new Date(d.createdAt) >= from && new Date(d.createdAt) <= to;
        });
        const users = store.users || [];
        const rows = data.map((d, i) => {
          const assignedBy = users.find(u => u.id === d.delegatedBy)?.name || d.delegatedBy || '—';
          return { '#': i + 1, 'Description': (d.description || '').substring(0, 100),
            'Assigned By': assignedBy, 'Client': d.client || '—',
            'Due Date': fmtDate(d.dueDate), 'Priority': d.priority || 'Low', 'Status': d.status || '—' };
        });
        return NextResponse.json({ rows, summary: {} });
      }

      if (type === 'Delegation MIS' || type === 'All MIS') {
        const data = (store.delegations || []).filter((d) => {
          const due = d.dueDate ? new Date(d.dueDate) : null;
          if (due) return due >= from && due <= to;
          return new Date(d.createdAt) >= from && new Date(d.createdAt) <= to;
        });
        const empMap = {};
        for (const t of data) {
          const name = t.doer || 'Unknown';
          if (!empMap[name]) empMap[name] = { name, total: 0, completed: 0, pending: 0, revised: 0, delayed: 0 };
          const e = empMap[name]; e.total++;
          if (t.status === 'done') {
            e.completed++;
          } else if (t.status === 'revise' || t.status === 'revise_requested') {
            e.revised++; e.pending++;
            if (t.dueDate && new Date(t.dueDate) < now) e.delayed++;
          } else {
            e.pending++;
            if (t.dueDate && new Date(t.dueDate) < now) e.delayed++;
          }
        }
        const rows = Object.values(empMap).map((e) => ({
          ...e, score: e.total > 0 ? Math.round(((e.completed / e.total) - 1) * 100 - (e.delayed / e.total) * 50) : 0,
        }));
        const summary = {
          'Total Tasks': data.length, 'Employees': rows.length,
          'Completed': data.filter((d) => d.status === 'done').length,
          'Pending': data.filter((d) => d.status !== 'done').length,
          'Delayed': data.filter((d) => d.status !== 'done' && d.dueDate && new Date(d.dueDate) < now).length,
          'Period': `${fmtDate(fromISO)} – ${fmtDate(toISO)}`,
        };
        return NextResponse.json({ rows, summary, view: 'employee' });
      }

      if (type === 'Checklist MIS') {
        const masters = store.masters || [];
        const empMap = {};
        for (const m of masters) {
          const name = m.assignedTo || 'Unknown';
          if (!empMap[name]) empMap[name] = { name, total: 0, completed: 0, pending: 0, revised: 0, delayed: 0 };
          empMap[name].total++;
          empMap[name].pending++;
        }
        const rows = Object.values(empMap).map((e) => ({
          ...e, score: e.total > 0 ? Math.round(((e.completed / e.total) - 1) * 100) : 0,
        }));
        const summary = {
          'Total Checklists': masters.length, 'Employees': rows.length,
          'Completions': 0, 'Period': `${fmtDate(fromISO)} – ${fmtDate(toISO)}`,
        };
        return NextResponse.json({ rows, summary, view: 'employee' });
      }

      return NextResponse.json({ rows: [], summary: {} });
    }

    // MySQL path
    await ensureSchema();

    // Drill-down: single employee
    if (employee && (type === 'Delegation MIS' || type === 'All MIS')) {
      const [data] = await pool.query(
        `SELECT d.id, d.description, d.client, d.due_date, d.priority, d.status,
                u.name AS delegated_by_name
         FROM delegations d LEFT JOIN users u ON u.id = d.delegated_by
         WHERE d.doer = ?
           AND ((d.due_date IS NOT NULL AND d.due_date BETWEEN ? AND ?)
             OR (d.due_date IS NULL     AND d.created_at BETWEEN ? AND ?))
         ORDER BY d.due_date ASC`,
        [employee, fromDT, toDT, fromDT, toDT]
      );
      const rows = data.map((d, i) => ({
        '#': i + 1, 'Description': (d.description || '').substring(0, 100),
        'Assigned By': d.delegated_by_name || d.delegated_by || '—',
        'Client': d.client || '—', 'Due Date': fmtDate(d.due_date),
        'Priority': d.priority || 'Low', 'Status': d.status || '—',
      }));
      return NextResponse.json({ rows, summary: {} });
    }

    // Delegation MIS
    if (type === 'Delegation MIS' || type === 'All MIS') {
      const [data] = await pool.query(
        `SELECT doer, status, due_date FROM delegations
         WHERE (due_date IS NOT NULL AND due_date BETWEEN ? AND ?)
            OR (due_date IS NULL     AND created_at BETWEEN ? AND ?)
         ORDER BY doer ASC`,
        [fromDT, toDT, fromDT, toDT]
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
        'Period': `${fmtDate(fromDT)} – ${fmtDate(toDT)}`,
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
        'Completions': completions.length, 'Period': `${fmtDate(fromDT)} – ${fmtDate(toDT)}`,
      };
      return NextResponse.json({ rows, summary, view: 'employee' });
    }
  } catch (err) {
    console.error('[MIS API]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ rows: [], summary: {} });
}

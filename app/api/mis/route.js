import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';
import { getFmsMisRows, getFmsMisDetailRows } from '@/lib/fmsSheet';

export const maxDuration = 30;

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  const url      = new URL(req.url);
  const start    = url.searchParams.get('start');
  const end      = url.searchParams.get('end');
  const type     = url.searchParams.get('type') || 'Delegation MIS';
  const employee = url.searchParams.get('employee');

  if (!start || !end)
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });

  const now    = new Date();
  const fromDT = start + ' 00:00:00';
  const toDT   = end   + ' 23:59:59';

  try {
    await ensureSchema();

    // The Sheets SQL engine supports neither JOIN nor OR/parenthesised WHERE
    // clauses, so both Delegation queries pull plain rows and do the date
    // window + the users join in JS (same pattern as lib/dailyReport.js).
    const dstr = (v) => {
      if (!v) return '';
      return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
    };
    // A task belongs to the window by due date; an undated one by creation date.
    const inWindow = (d) => {
      const day = dstr(d.due_date) || dstr(d.created_at);
      return day >= start && day <= end;
    };

    // Drill-down: single employee
    if (employee && (type === 'Delegation MIS' || type === 'All MIS')) {
      const [[all], [users]] = await Promise.all([
        pool.query(
          `SELECT id, description, client, due_date, created_at, priority, status, delegated_by
           FROM delegations WHERE doer = ?`, [employee]),
        pool.query('SELECT id, name FROM users'),
      ]);
      const nameById = Object.fromEntries(users.map((u) => [String(u.id), u.name]));
      const data = all.filter(inWindow)
        .sort((a, b) => dstr(a.due_date).localeCompare(dstr(b.due_date)));
      const rows = data.map((d, i) => ({
        '#': i + 1, 'Description': (d.description || '').substring(0, 100),
        'Assigned By': nameById[String(d.delegated_by)] || d.delegated_by || '—',
        'Client': d.client || '—', 'Due Date': fmtDate(d.due_date),
        'Priority': d.priority || 'Low', 'Status': d.status || '—',
      }));
      return NextResponse.json({ rows, summary: {} });
    }

    // Delegation MIS
    if (type === 'Delegation MIS' || type === 'All MIS') {
      const [all] = await pool.query('SELECT doer, status, due_date, created_at FROM delegations');
      const data = all.filter(inWindow)
        .sort((a, b) => String(a.doer || '').localeCompare(String(b.doer || '')));
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
        // 0–100 minus a delay penalty — the "- 1" that used to sit here capped
        // a perfect employee at exactly 0, so every score rendered negative.
        ...e, score: e.total > 0 ? Math.round((e.completed / e.total) * 100 - (e.delayed / e.total) * 50) : 0,
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

    // Checklist MIS drill-down: single employee
    if (employee && type === 'Checklist MIS') {
      const [[masters], [completions]] = await Promise.all([
        pool.query('SELECT id, task, assigned_to, frequency FROM masters WHERE assigned_to = ? ORDER BY id', [employee]),
        pool.query('SELECT master_id FROM checklist_completions WHERE date BETWEEN ? AND ?', [start, end])
          .catch(() => [[]]),
      ]);
      const doneSet = {};
      for (const c of completions) doneSet[c.master_id] = (doneSet[c.master_id] || 0) + 1;
      const rows = masters.map((m, i) => ({
        '#': i + 1,
        'Description': m.task || '—',
        'Assigned By': m.assigned_to || '—',
        'Due Date': `${m.frequency}`,
        'Status': doneSet[m.id] > 0 ? 'done' : 'pending',
      }));
      return NextResponse.json({ rows, summary: {} });
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
        ...e, score: e.total > 0 ? Math.round((e.completed / e.total) * 100) : 0,
      }));
      const summary = {
        'Total Checklists': masters.length, 'Employees': rows.length,
        'Completions': completions.length, 'Period': `${fmtDate(fromDT)} – ${fmtDate(toDT)}`,
      };
      return NextResponse.json({ rows, summary, view: 'employee' });
    }

    // FMS MIS drill-down: single employee
    if (employee && type === 'FMS MIS') {
      const detail = await getFmsMisDetailRows(employee, start, end);
      const rows = detail.map((d, i) => ({
        '#': i + 1, 'Description': `${d.fmsName} · ${d.stepName}`,
        'Assigned By': '—', 'Client': '—', 'Due Date': fmtDate(d.dueDate),
        'Priority': '—', 'Status': d.status,
      }));
      return NextResponse.json({ rows, summary: {} });
    }

    // FMS MIS
    if (type === 'FMS MIS') {
      const empRows = await getFmsMisRows(start, end);
      const rows = empRows.map((e) => ({
        ...e, score: e.total > 0 ? Math.round((e.completed / e.total) * 100 - (e.delayed / e.total) * 50) : 0,
      }));
      const totalTasks = empRows.reduce((s, e) => s + e.total, 0);
      const completed  = empRows.reduce((s, e) => s + e.completed, 0);
      const summary = {
        'Total Tasks': totalTasks, 'Employees': rows.length,
        'Completed': completed, 'Pending': totalTasks - completed,
        'Delayed': empRows.reduce((s, e) => s + e.delayed, 0),
        'Period': `${fmtDate(fromDT)} – ${fmtDate(toDT)}`,
      };
      return NextResponse.json({ rows, summary, view: 'employee' });
    }
  } catch (err) {
    console.error('[MIS API]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ rows: [], summary: {} });
}

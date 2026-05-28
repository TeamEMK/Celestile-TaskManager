import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export async function GET(req) {
  const url      = new URL(req.url);
  const start    = url.searchParams.get('start');
  const end      = url.searchParams.get('end');
  const type     = url.searchParams.get('type') || 'Delegation MIS';
  const employee = url.searchParams.get('employee'); // drill-down filter

  if (!start || !end)
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });

  const from = new Date(start);
  const to   = new Date(end); to.setHours(23, 59, 59);
  const now  = new Date();

  // ── Delegation MIS — employee-wise summary ──────────────────────────────────
  if (type === 'Delegation MIS' || type === 'All MIS') {
    const data = await sql`
      SELECT d.*, u.name AS user_name
      FROM delegations d
      LEFT JOIN users u ON u.id = d.doer_id
      WHERE (
        (due_date   IS NOT NULL AND due_date   BETWEEN ${from.toISOString()} AND ${to.toISOString()})
        OR
        (created_at IS NOT NULL AND created_at BETWEEN ${from.toISOString()} AND ${to.toISOString()})
      )
      ${employee ? sql`AND d.doer = ${employee}` : sql``}
      ORDER BY doer ASC, created_at DESC`;

    // Drill-down: return individual task rows for one employee
    if (employee) {
      const rows = data.map((d, i) => ({
        '#':           i + 1,
        'ID':          d.id,
        'Description': (d.description || '').substring(0, 100),
        'Client':      d.client || '—',
        'Due Date':    fmtDate(d.due_date),
        'Priority':    d.priority || 'Low',
        'Status':      d.status || '—',
      }));
      return NextResponse.json({ rows, summary: {} });
    }

    // Group by employee
    const empMap = {};
    for (const t of data) {
      const name = t.doer || 'Unknown';
      if (!empMap[name]) empMap[name] = { name, tasks: [] };
      empMap[name].tasks.push(t);
    }

    const rows = Object.values(empMap).map((e) => {
      const total     = e.tasks.length;
      const completed = e.tasks.filter((t) => t.status === 'done').length;
      const revised   = e.tasks.filter((t) => t.status === 'revise' || t.status === 'revise_requested').length;
      const pending   = e.tasks.filter((t) => t.status === 'pending' || t.status === 'revise').length;
      const delayed   = e.tasks.filter((t) =>
        (t.status === 'pending' || t.status === 'revise') && t.due_date && new Date(t.due_date) < now
      ).length;
      const score = total > 0
        ? Math.round(((completed / total) - 1) * 100 - (delayed / total) * 50)
        : 0;

      return { name: e.name, total, pending, completed, revised, delayed, score };
    });

    const summary = {
      'Total Tasks':  data.length,
      'Employees':    rows.length,
      'Completed':    data.filter((d) => d.status === 'done').length,
      'Pending':      data.filter((d) => d.status === 'pending').length,
      'Delayed':      data.filter((d) => (d.status === 'pending' || d.status === 'revise') && d.due_date && new Date(d.due_date) < now).length,
      'Period':       `${fmtDate(from.toISOString())} – ${fmtDate(to.toISOString())}`,
    };

    return NextResponse.json({ rows, summary, view: 'employee' });
  }

  // ── Checklist MIS ────────────────────────────────────────────────────────────
  if (type === 'Checklist MIS') {
    const masters = await sql`SELECT * FROM masters ORDER BY assigned_to, id`;
    let completions = [];
    try {
      completions = await sql`
        SELECT master_id, date, doer FROM checklist_completions
        WHERE date BETWEEN ${start} AND ${end} ORDER BY date DESC`;
    } catch { completions = []; }

    // Group by employee
    const empMap = {};
    for (const m of masters) {
      const name = m.assigned_to || 'Unknown';
      if (!empMap[name]) empMap[name] = { name, tasks: [], done: 0 };
      empMap[name].tasks.push(m);
      const done = completions.filter((c) => c.master_id === m.id).length;
      empMap[name].done += done;
    }

    const rows = Object.values(empMap).map((e) => {
      const total     = e.tasks.length;
      const completed = e.done;
      const pending   = Math.max(0, total - completed);
      const score     = total > 0 ? Math.round(((completed / total) - 1) * 100) : 0;
      return { name: e.name, total, pending, completed, revised: 0, delayed: 0, score };
    });

    const summary = {
      'Total Checklists': masters.length,
      'Employees':        rows.length,
      'Completions':      completions.length,
      'Period':           `${fmtDate(from.toISOString())} – ${fmtDate(to.toISOString())}`,
    };

    return NextResponse.json({ rows, summary, view: 'employee' });
  }

  return NextResponse.json({ rows: [], summary: {} });
}

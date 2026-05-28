import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export async function GET(req) {
  const url    = new URL(req.url);
  const start  = url.searchParams.get('start');
  const end    = url.searchParams.get('end');
  const type   = url.searchParams.get('type') || 'Delegation MIS';

  if (!start || !end)
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });

  const from = new Date(start);
  const to   = new Date(end); to.setHours(23, 59, 59);

  let rows    = [];
  let summary = {};

  // ── Delegation MIS ───────────────────────────────────────────────────────────
  if (type === 'Delegation MIS' || type === 'All MIS') {
    const data = await sql`
      SELECT id, description, doer, delegated_by, client,
             due_date, status, priority, type AS task_type,
             created_at, completed_at
      FROM delegations
      WHERE (
        (due_date    IS NOT NULL AND due_date    BETWEEN ${from.toISOString()} AND ${to.toISOString()})
        OR
        (created_at  IS NOT NULL AND created_at  BETWEEN ${from.toISOString()} AND ${to.toISOString()})
      )
      ORDER BY COALESCE(created_at, due_date) DESC`;

    const delRows = data.map((d, i) => ({
      '#':           i + 1,
      'ID':          d.id,
      'Description': (d.description || '').substring(0, 80),
      'Doer':        d.doer || '—',
      'Client':      d.client || '—',
      'Due Date':    fmtDate(d.due_date),
      'Priority':    d.priority || 'Low',
      'Status':      d.status || '—',
      'Type':        d.task_type || 'delegation',
      'Created':     fmtDate(d.created_at),
      'Completed':   fmtDate(d.completed_at),
    }));

    rows = rows.concat(delRows);

    if (type === 'Delegation MIS') {
      summary = {
        'Total Tasks': data.length,
        'Completed':   data.filter((d) => d.status === 'done').length,
        'Pending':     data.filter((d) => d.status === 'pending').length,
        'Revised':     data.filter((d) => d.status === 'revise' || d.status === 'revise_requested').length,
        'Period':      `${fmtDate(from.toISOString())} – ${fmtDate(to.toISOString())}`,
      };
    }
  }

  // ── Checklist MIS ────────────────────────────────────────────────────────────
  if (type === 'Checklist MIS') {
    const masters = await sql`SELECT * FROM masters ORDER BY id`;

    let completions = [];
    try {
      completions = await sql`
        SELECT master_id, date, doer FROM checklist_completions
        WHERE date BETWEEN ${start} AND ${end}
        ORDER BY date DESC`;
    } catch { completions = []; }

    rows = masters.map((m, i) => {
      const done = completions.filter((c) => c.master_id === m.id);
      return {
        '#':             i + 1,
        'ID':            m.id,
        'Task':          m.task || '—',
        'Assigned To':   m.assigned_to || '—',
        'Frequency':     m.frequency || '—',
        'Times Done':    done.length,
        'Last Done':     done.length ? fmtDate(done[0].date) : '—',
        'Created':       fmtDate(m.created_at),
      };
    });

    summary = {
      'Total Checklists':   masters.length,
      'Completions':        completions.length,
      'Period':             `${fmtDate(from.toISOString())} – ${fmtDate(to.toISOString())}`,
    };
  }

  // ── All MIS ──────────────────────────────────────────────────────────────────
  if (type === 'All MIS') {
    summary = {
      'Total Records': rows.length,
      'Completed':     rows.filter((r) => r['Status'] === 'done').length,
      'Pending':       rows.filter((r) => r['Status'] === 'pending').length,
      'Period':        `${fmtDate(from.toISOString())} – ${fmtDate(to.toISOString())}`,
    };
  }

  return NextResponse.json({ rows, summary });
}

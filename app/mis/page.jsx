import MISClient from './MISClient';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { pool, ensureSchema } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function MISPage({ searchParams }) {
  const session = await getServerSession(authOptions);
  const roles   = session?.user?.roles || [];
  const isAdmin = Array.isArray(roles) ? roles.includes('Admin') : String(roles).includes('Admin');
  if (!isAdmin) redirect('/');

  await ensureSchema();

  const today    = new Date().toISOString().split('T')[0];
  const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);
  const start    = searchParams?.start || lastWeek.toISOString().split('T')[0];
  const end      = searchParams?.end   || today;
  const type     = searchParams?.type  || 'Delegation MIS';

  const from    = new Date(start);
  const to      = new Date(end); to.setHours(23, 59, 59);
  const now     = new Date();
  const fromISO = from.toISOString();
  const toISO   = to.toISOString();

  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  let rows = [], summary = {};

  try {
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
        if (t.status === 'done') { e.completed++; }
        else if (t.status === 'revise' || t.status === 'revise_requested') {
          e.revised++; e.pending++;
          if (t.due_date && new Date(t.due_date) < now) e.delayed++;
        } else {
          e.pending++;
          if (t.due_date && new Date(t.due_date) < now) e.delayed++;
        }
      }
      rows = Object.values(empMap).map((e) => ({
        ...e, score: e.total > 0 ? Math.round(((e.completed / e.total) - 1) * 100 - (e.delayed / e.total) * 50) : 0,
      }));
      summary = {
        'Total Tasks': data.length, 'Employees': rows.length,
        'Completed': data.filter((d) => d.status === 'done').length,
        'Pending': data.filter((d) => d.status !== 'done').length,
        'Delayed': data.filter((d) => d.status !== 'done' && d.due_date && new Date(d.due_date) < now).length,
        'Period': `${fmtDate(fromISO)} – ${fmtDate(toISO)}`,
      };
    }

    if (type === 'Checklist MIS') {
      const [[masters], [completions]] = await Promise.all([
        pool.query('SELECT id, task, assigned_to, frequency FROM masters ORDER BY assigned_to, id'),
        pool.query('SELECT master_id FROM checklist_completions WHERE date BETWEEN ? AND ?', [start, end]).catch(() => [[]]),
      ]);
      const doneSet = {};
      for (const c of completions) doneSet[c.master_id] = (doneSet[c.master_id] || 0) + 1;
      const empMap = {};
      for (const m of masters) {
        const name = m.assigned_to || 'Unknown';
        if (!empMap[name]) empMap[name] = { name, total: 0, completed: 0, pending: 0, revised: 0, delayed: 0 };
        empMap[name].total++;
        if (doneSet[m.id]) empMap[name].completed++;
        else empMap[name].pending++;
      }
      rows = Object.values(empMap).map((e) => ({
        ...e, score: e.total > 0 ? Math.round(((e.completed / e.total) - 1) * 100) : 0,
      }));
      summary = {
        'Total Checklists': masters.length, 'Employees': rows.length,
        'Completions': completions.length, 'Period': `${fmtDate(fromISO)} – ${fmtDate(toISO)}`,
      };
    }
  } catch (err) {
    console.error('[MIS]', err.message);
  }

  return (
    <MISClient
      initialRows={rows} initialSummary={summary}
      initialStart={start} initialEnd={end} initialType={type}
    />
  );
}

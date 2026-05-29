import AllTasksClient from './AllTasksClient';
import { pool, ensureSchema } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AllTasksPage() {
  await ensureSchema();

  const [[delegations], [users], [masters], [completions]] = await Promise.all([
    pool.query(`SELECT id, description, doer_id AS doerId, doer, delegated_by AS delegatedBy,
                       due_date AS dueDate, client, status, type, created_at AS createdAt
                FROM delegations WHERE status != 'approval_pending' ORDER BY created_at DESC`),
    pool.query('SELECT id, name, email, department, roles FROM users ORDER BY id'),
    pool.query('SELECT id, task, assigned_to AS assignedTo, frequency FROM masters ORDER BY created_at DESC'),
    pool.query('SELECT master_id FROM checklist_completions WHERE date = CURDATE()'),
  ]);

  const completedToday = new Set(completions.map((c) => c.master_id));

  const allTasks = [
    ...delegations,
    ...masters.map((m) => ({
      id: m.id, description: m.task, doer: m.assignedTo, doerId: null,
      dueDate: null, client: '', status: completedToday.has(m.id) ? 'done' : 'pending',
      type: 'Checklist', frequency: m.frequency,
    })),
  ];

  const byDoer = {};
  users.forEach((u) => { byDoer[u.name] = { doer: u.name, doerId: u.id, tasks: [] }; });
  allTasks.forEach((t) => {
    if (!t.doer) return;
    if (!byDoer[t.doer]) byDoer[t.doer] = { doer: t.doer, doerId: t.doerId, tasks: [] };
    byDoer[t.doer].tasks.push(t);
  });

  const grouped = Object.values(byDoer).filter((g) => g.tasks.length > 0);
  return <AllTasksClient grouped={grouped} users={users} />;
}

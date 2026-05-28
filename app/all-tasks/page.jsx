import { neon } from '@neondatabase/serverless';
import AllTasksClient from './AllTasksClient';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL);

export default async function AllTasksPage() {
  const [delegations, users, masters, completions] = await Promise.all([
    sql`SELECT id, description, doer_id as "doerId", doer, delegated_by as "delegatedBy", due_date as "dueDate", client, status, type, created_at as "createdAt" FROM delegations ORDER BY created_at DESC`,
    sql`SELECT id, name, email, department, roles FROM users ORDER BY id`,
    sql`SELECT id, task, assigned_to as "assignedTo", frequency FROM masters ORDER BY created_at DESC`,
    sql`SELECT master_id, date FROM checklist_completions WHERE date = CURRENT_DATE`,
  ]);

  const completedToday = new Set(completions.map((c) => c.master_id));

  const allTasks = [
    ...delegations,
    ...masters.map((m) => ({
      id: m.id,
      description: m.task,
      doer: m.assignedTo,
      doerId: null,
      dueDate: null,
      client: '',
      status: completedToday.has(m.id) ? 'done' : 'pending',
      type: 'Checklist',
      frequency: m.frequency,
    })),
  ];

  const byDoer = {};
  users.forEach((u) => {
    byDoer[u.name] = { doer: u.name, doerId: u.id, tasks: [] };
  });
  allTasks.forEach((t) => {
    if (!t.doer) return;
    if (!byDoer[t.doer]) byDoer[t.doer] = { doer: t.doer, doerId: t.doerId, tasks: [] };
    byDoer[t.doer].tasks.push(t);
  });

  const grouped = Object.values(byDoer).filter((g) => g.tasks.length > 0);

  return <AllTasksClient grouped={grouped} users={users} />;
}
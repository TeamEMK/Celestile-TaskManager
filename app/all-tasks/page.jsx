import AllTasksClient from './AllTasksClient';
import { pool } from '@/lib/db';
import { readStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

const hasDB = !!process.env.DB_HOST;

export default async function AllTasksPage() {
  let delegations = [], users = [], masters = [], completions = [];

  if (hasDB) {
    [delegations, users, masters, completions] = await Promise.all([
      pool.query(`SELECT id, description, doer_id AS doerId, doer, delegated_by AS delegatedBy,
                         due_date AS dueDate, client, status, type, priority, approval, url, remarks,
                         transferred_by AS transferredBy, transferred_from AS transferredFrom, created_at AS createdAt
                  FROM delegations WHERE NOT (approval = 'Approval Required' AND status = 'pending')
                  ORDER BY created_at DESC`)
        .then(([r]) => r).catch(() => []),
      pool.query('SELECT id, name, email, department, roles FROM users ORDER BY id')
        .then(([r]) => r).catch(() => []),
      pool.query('SELECT id, task, assigned_to AS assignedTo, frequency FROM masters ORDER BY created_at DESC')
        .then(([r]) => r).catch(() => []),
      pool.query('SELECT master_id FROM checklist_completions WHERE date = CURDATE()')
        .then(([r]) => r).catch(() => []),
    ]);
  } else {
    const store = await readStore();
    delegations = (store.delegations || [])
      .filter((d) => !(d.approval === 'Approval Required' && d.status === 'pending'))
      .map((d) => ({
        id: d.id, description: d.description, doerId: d.doerId,
        doer: d.doer, delegatedBy: d.delegatedBy, dueDate: d.dueDate,
        client: d.client || '', status: d.status, type: d.type || 'delegation',
        priority: d.priority, approval: d.approval, url: d.url || '',
        transferredBy: d.transferredBy || null, transferredFrom: d.transferredFrom || null, createdAt: d.createdAt,
      }));
    users = store.users || [];
    masters = (store.masters || []).map((m) => ({ id: m.id, task: m.task, assignedTo: m.assignedTo, frequency: m.frequency }));
    completions = [];
  }

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

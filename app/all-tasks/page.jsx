import AllTasksClient from './AllTasksClient';
import { pool } from '@/lib/db';
import { readStore } from '@/lib/store';
import { FMS_ENABLED } from '@/lib/config';
import { getMyFmsPendingRows } from '@/lib/fmsSheet';

export const dynamic = 'force-dynamic';

const hasDB = !!process.env.DB_HOST;

export default async function AllTasksPage() {
  let delegations = [], users = [], masters = [], completions = [], fmsTasks = [];

  if (hasDB) {
    [delegations, users, masters, completions] = await Promise.all([
      pool.query(`SELECT id, description, doer_id AS doerId, doer, delegated_by AS delegatedBy,
                         due_date AS dueDate, client, status, type, priority, approval,
                         approver_id AS approverId, approver, url, remarks, image,
                         require_file AS requireFile, attachment,
                         transferred_by AS transferredBy, transferred_from AS transferredFrom, created_at AS createdAt
                  FROM delegations
                  ORDER BY created_at DESC`)
        .then(([r]) => r).catch(() => []),
      pool.query('SELECT id, name, email, department, roles FROM users ORDER BY id')
        .then(([r]) => r).catch(() => []),
      pool.query('SELECT id, task, assigned_to AS assignedTo, frequency, require_file AS requireFile, attachment, created_at AS createdAt FROM masters ORDER BY created_at DESC')
        .then(([r]) => r).catch(() => []),
      pool.query('SELECT master_id FROM checklist_completions WHERE date = CURDATE()')
        .then(([r]) => r).catch(() => []),
    ]);
    if (FMS_ENABLED) fmsTasks = await getMyFmsPendingRows({ isAdmin: true }).catch(() => []);
  } else {
    const store = await readStore();
    delegations = (store.delegations || [])
      .map((d) => ({
        id: d.id, description: d.description, doerId: d.doerId,
        doer: d.doer, delegatedBy: d.delegatedBy, dueDate: d.dueDate,
        client: d.client || '', status: d.status, type: d.type || 'delegation',
        priority: d.priority, approval: d.approval, approverId: d.approverId, approver: d.approver,
        url: d.url || '', image: d.image || '',
        transferredBy: d.transferredBy || null, transferredFrom: d.transferredFrom || null, createdAt: d.createdAt,
      }));
    users = store.users || [];
    masters = (store.masters || []).map((m) => ({ id: m.id, task: m.task, assignedTo: m.assignedTo, frequency: m.frequency, createdAt: m.createdAt }));
    completions = [];
  }

  const completedToday = new Set(completions.map((c) => c.master_id));

  const allTasks = [
    ...delegations,
    ...masters.map((m) => ({
      id: m.id, description: m.task, doer: m.assignedTo, doerId: null,
      dueDate: m.createdAt || null, client: '', status: completedToday.has(m.id) ? 'done' : 'pending',
      type: 'Checklist', frequency: m.frequency, createdAt: m.createdAt,
      requireFile: m.requireFile || 0, attachment: m.attachment || '',
    })),
    ...fmsTasks,
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

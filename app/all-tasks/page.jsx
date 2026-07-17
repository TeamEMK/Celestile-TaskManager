import AllTasksClient from './AllTasksClient';
import { pool } from '@/lib/db';
import { readStore } from '@/lib/store';
import { FMS_ENABLED } from '@/lib/config';

export const dynamic = 'force-dynamic';

const hasDB = !!process.env.DB_HOST;

// One pending item per FMS entry — its earliest not-yet-completed step (steps
// are sequential, so only that one is actionable; later steps are "future").
async function buildFmsPendingTasks() {
  try {
    const [flows] = await pool.query('SELECT id, name, steps FROM fms_flows');
    if (!flows.length) return [];
    const flowMap = {};
    flows.forEach((f) => { flowMap[f.id] = { name: f.name, steps: f.steps ? JSON.parse(f.steps) : [] }; });

    const [entries] = await pool.query(
      'SELECT id, flow_id, client_name, lead_date, doer_name, created_at FROM fms_flow_entries'
    );
    if (!entries.length) return [];

    const eIds = entries.map((e) => e.id);
    const [steps] = await pool.query(
      `SELECT entry_id, step_index, completed_at FROM fms_flow_steps WHERE entry_id IN (${eIds.map(() => '?').join(',')})`,
      eIds
    );
    const stepsMap = {};
    steps.forEach((s) => {
      if (!stepsMap[s.entry_id]) stepsMap[s.entry_id] = {};
      stepsMap[s.entry_id][s.step_index] = s.completed_at;
    });

    const items = [];
    entries.forEach((e) => {
      const flow = flowMap[e.flow_id];
      if (!flow || !e.doer_name) return;
      const entrySteps = stepsMap[e.id] || {};
      let cur = -1;
      for (let i = 0; i < flow.steps.length; i++) {
        if (!entrySteps[i]) { cur = i; break; }
      }
      if (cur === -1) return; // all steps completed
      const stepName = flow.steps[cur] || `Step ${cur + 1}`;
      items.push({
        id: `${e.id}-${cur}`,
        doerId: null,
        type: 'FMS',
        description: `${flow.name} · ${stepName}${e.client_name ? ' — ' + e.client_name : ''}`,
        doer: e.doer_name,
        dueDate: e.lead_date || null,
        client: e.client_name || '',
        status: 'pending',
        createdAt: e.created_at,
      });
    });
    return items;
  } catch {
    return [];
  }
}

export default async function AllTasksPage() {
  let delegations = [], users = [], masters = [], completions = [], fmsTasks = [];

  if (hasDB) {
    [delegations, users, masters, completions] = await Promise.all([
      pool.query(`SELECT id, description, doer_id AS doerId, doer, delegated_by AS delegatedBy,
                         due_date AS dueDate, client, status, type, priority, approval, url, remarks, image,
                         require_file AS requireFile, attachment,
                         transferred_by AS transferredBy, transferred_from AS transferredFrom, created_at AS createdAt
                  FROM delegations WHERE NOT (approval = 'Approval Required' AND status = 'pending')
                  ORDER BY created_at DESC`)
        .then(([r]) => r).catch(() => []),
      pool.query('SELECT id, name, email, department, roles FROM users ORDER BY id')
        .then(([r]) => r).catch(() => []),
      pool.query('SELECT id, task, assigned_to AS assignedTo, frequency, require_file AS requireFile, attachment, created_at AS createdAt FROM masters ORDER BY created_at DESC')
        .then(([r]) => r).catch(() => []),
      pool.query('SELECT master_id FROM checklist_completions WHERE date = CURDATE()')
        .then(([r]) => r).catch(() => []),
    ]);
    if (FMS_ENABLED) fmsTasks = await buildFmsPendingTasks();
  } else {
    const store = await readStore();
    delegations = (store.delegations || [])
      .filter((d) => !(d.approval === 'Approval Required' && d.status === 'pending'))
      .map((d) => ({
        id: d.id, description: d.description, doerId: d.doerId,
        doer: d.doer, delegatedBy: d.delegatedBy, dueDate: d.dueDate,
        client: d.client || '', status: d.status, type: d.type || 'delegation',
        priority: d.priority, approval: d.approval, url: d.url || '', image: d.image || '',
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

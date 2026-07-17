import { pool } from '@/lib/db';

// One pending item per active FMS flow entry — its earliest not-yet-completed
// step (steps are sequential, so only that one is actionable; later steps
// are "future" and don't show up here).
export async function buildFmsPendingTasks() {
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
        flowName: flow.name,
        stepName,
        stepIndex: cur,
        entryId: e.id,
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

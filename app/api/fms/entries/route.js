import { NextResponse } from 'next/server';
import { pool, ensureSchema, toMysqlDate } from '@/lib/db';
import { requireUser } from '@/lib/api';

export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const { searchParams } = new URL(req.url);
    const flowId = searchParams.get('flowId');
    if (!flowId) return NextResponse.json({ error: 'flowId required' }, { status: 400 });

    const [entries] = await pool.query(
      'SELECT * FROM fms_flow_entries WHERE flow_id = ? ORDER BY created_at DESC',
      [flowId]
    );
    if (!entries.length) return NextResponse.json({ entries: [] });

    const eIds = entries.map(e => e.id);
    const [steps] = await pool.query(
      `SELECT * FROM fms_flow_steps WHERE entry_id IN (${eIds.map(() => '?').join(',')}) ORDER BY entry_id, step_index`,
      eIds
    );

    const stepsMap = {};
    steps.forEach(s => {
      if (!stepsMap[s.entry_id]) stepsMap[s.entry_id] = {};
      stepsMap[s.entry_id][s.step_index] = {
        completed_at: s.completed_at || null,
        completed_by: s.completed_by || '',
      };
    });

    const result = entries.map(e => ({
      id: e.id,
      flow_id: e.flow_id,
      skm_no: e.skm_no || '',
      order_no: e.order_no || '',
      client_name: e.client_name || '',
      area: e.area || '',
      technology: e.technology || '',
      sft: e.sft || '',
      lead_date: e.lead_date || null,
      planned_date: e.planned_date || null,
      doer_name: e.doer_name || '',
      doer_email: e.doer_email || '',
      status: e.status || 'active',
      created_at: e.created_at,
      steps: stepsMap[e.id] || {},
    }));

    return NextResponse.json({ entries: result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.flow_id) return NextResponse.json({ error: 'flow_id required' }, { status: 400 });

    const [flows] = await pool.query('SELECT steps FROM fms_flows WHERE id = ?', [body.flow_id]);
    if (!flows.length) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });

    const flowSteps = flows[0].steps ? JSON.parse(flows[0].steps) : [];
    const id = 'ENT' + Date.now() + Math.random().toString(36).slice(2, 5).toUpperCase();
    const currentStepIdx = Number(body.current_step_idx || 0);

    await pool.query(
      `INSERT INTO fms_flow_entries
         (id, flow_id, skm_no, order_no, client_name, area, technology, sft, lead_date, planned_date, doer_name, doer_email, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        id, body.flow_id,
        body.skm_no || '', body.order_no || '', body.client_name || '',
        body.area || '', body.technology || '', body.sft || '',
        toMysqlDate(body.lead_date) || null, toMysqlDate(body.planned_date) || null,
        body.doer_name || '', body.doer_email || '',
      ]
    );

    for (let i = 0; i < flowSteps.length; i++) {
      const isDone = i < currentStepIdx;
      await pool.query(
        'INSERT INTO fms_flow_steps (entry_id, step_index, completed_at, completed_by) VALUES (?, ?, ?, ?)',
        [id, i, isDone ? (body.entry_timestamp || new Date().toISOString().replace('T',' ').slice(0,19)) : null, isDone ? (body.doer_name || '') : '']
      );
    }

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';

function buildPlannedSteps(startDate = new Date()) {
  const steps = [];
  const d = new Date(startDate);
  for (let i = 0; i < 6; i++) {
    d.setDate(d.getDate() + (i === 0 ? 0 : 7));
    steps.push({ planned: d.toISOString().slice(0, 10), actual: null });
  }
  return steps;
}

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const [entries] = await pool.query(
      'SELECT * FROM fms ORDER BY created_at DESC'
    );
    const [steps] = await pool.query('SELECT * FROM fms_steps ORDER BY fms_id, step_index');
    const stepsMap = {};
    for (const s of steps) {
      if (!stepsMap[s.fms_id]) stepsMap[s.fms_id] = [];
      stepsMap[s.fms_id].push({ planned: s.planned, actual: s.actual });
    }
    const result = entries.map(e => ({
      id: e.id,
      clientName: e.client_name,
      platforms: e.platforms,
      mobile: e.mobile,
      doer: e.doer,
      createdAt: e.created_at,
      steps: stepsMap[e.id] || [],
    }));
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.clientName?.trim())
      return NextResponse.json({ error: 'Client name required' }, { status: 400 });

    const id = 'FMS' + Date.now();
    await pool.query(
      'INSERT INTO fms (id, client_name, platforms, mobile, doer, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [id, body.clientName.trim(), body.platforms || '', body.mobile || '', body.doer || '']
    );

    const steps = buildPlannedSteps(new Date());
    for (let i = 0; i < steps.length; i++) {
      await pool.query(
        'INSERT INTO fms_steps (fms_id, step_index, planned, actual) VALUES (?, ?, ?, ?)',
        [id, i, steps[i].planned, steps[i].actual]
      );
    }

    return NextResponse.json({
      id, clientName: body.clientName.trim(),
      platforms: body.platforms || '', mobile: body.mobile || '',
      doer: body.doer || '', steps, createdAt: new Date().toISOString(),
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const [flows] = await pool.query('SELECT * FROM fms_flows ORDER BY created_at DESC');
    if (!flows.length) return NextResponse.json({ flows: [] });

    const ids = flows.map(f => f.id);
    const placeholders = ids.map(() => '?').join(',');

    const [entryCounts] = await pool.query(
      `SELECT flow_id, COUNT(*) as total FROM fms_flow_entries WHERE flow_id IN (${placeholders}) GROUP BY flow_id`,
      ids
    );
    const [pendingCounts] = await pool.query(
      `SELECT e.flow_id, COUNT(DISTINCT e.id) as pending
       FROM fms_flow_entries e
       WHERE e.flow_id IN (${placeholders})
         AND EXISTS (SELECT 1 FROM fms_flow_steps s WHERE s.entry_id = e.id AND s.completed_at IS NULL)
       GROUP BY e.flow_id`,
      ids
    );

    const totals = {}, pending = {};
    entryCounts.forEach(r => { totals[r.flow_id] = Number(r.total); });
    pendingCounts.forEach(r => { pending[r.flow_id] = Number(r.pending); });

    const result = flows.map(f => ({
      id: f.id,
      name: f.name,
      coordinator: f.coordinator || '',
      steps: f.steps ? JSON.parse(f.steps) : [],
      sheet_url: f.sheet_url || '',
      color: f.color || '#2563eb',
      created_at: f.created_at,
      stats: { total: totals[f.id] || 0, pending: pending[f.id] || 0 },
    }));

    return NextResponse.json({ flows: result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const id = 'FLW' + Date.now();
    await pool.query(
      'INSERT INTO fms_flows (id, name, coordinator, steps, sheet_url, color) VALUES (?, ?, ?, ?, ?, ?)',
      [id, body.name.trim(), body.coordinator || '', JSON.stringify(body.steps || []), body.sheet_url || '', body.color || '#2563eb']
    );
    return NextResponse.json({ id, name: body.name.trim() }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const [entries] = await pool.query('SELECT id FROM fms_flow_entries WHERE flow_id = ?', [id]);
    if (entries.length) {
      const eIds = entries.map(e => e.id);
      await pool.query(`DELETE FROM fms_flow_steps WHERE entry_id IN (${eIds.map(() => '?').join(',')})`, eIds);
    }
    await pool.query('DELETE FROM fms_flow_entries WHERE flow_id = ?', [id]);
    await pool.query('DELETE FROM fms_flows WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await pool.query(
      'UPDATE fms_flows SET name=?, coordinator=?, steps=?, color=?, sheet_url=? WHERE id=?',
      [body.name || '', body.coordinator || '', JSON.stringify(body.steps || []), body.color || '#2563eb', body.sheet_url || '', body.id]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

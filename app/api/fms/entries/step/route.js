import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const { entryId, stepIndex, completedBy, undo } = await req.json();
    if (!entryId || stepIndex === undefined) {
      return NextResponse.json({ error: 'entryId and stepIndex required' }, { status: 400 });
    }

    const completedAt = undo ? null : new Date().toISOString().replace('T', ' ').slice(0, 19);

    const [rows] = await pool.query(
      'SELECT * FROM fms_flow_steps WHERE entry_id = ? AND step_index = ?',
      [entryId, stepIndex]
    );

    if (rows.length) {
      await pool.query(
        'UPDATE fms_flow_steps SET completed_at = ?, completed_by = ? WHERE entry_id = ? AND step_index = ?',
        [completedAt, undo ? '' : (completedBy || ''), entryId, stepIndex]
      );
    } else {
      await pool.query(
        'INSERT INTO fms_flow_steps (entry_id, step_index, completed_at, completed_by) VALUES (?, ?, ?, ?)',
        [entryId, stepIndex, completedAt, completedBy || '']
      );
    }

    return NextResponse.json({ success: true, completed_at: completedAt });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

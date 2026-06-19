import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const { fmsId, stepIndex } = await req.json();
    if (!fmsId || stepIndex === undefined)
      return NextResponse.json({ error: 'fmsId and stepIndex required' }, { status: 400 });

    const [rows] = await pool.query(
      'SELECT * FROM fms_steps WHERE fms_id = ? AND step_index = ?', [fmsId, stepIndex]
    );
    if (!rows.length) return NextResponse.json({ error: 'Step not found' }, { status: 404 });

    await pool.query(
      'UPDATE fms_steps SET actual = NOW() WHERE fms_id = ? AND step_index = ?',
      [fmsId, stepIndex]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

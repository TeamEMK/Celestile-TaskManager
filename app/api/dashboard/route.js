import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const [[dels], [masters], [users], [chkToday]] = await Promise.all([
      pool.query("SELECT status, due_date FROM delegations"),
      pool.query("SELECT id FROM masters"),
      pool.query("SELECT id FROM users WHERE active = 1"),
      // No DISTINCT — the Sheets SQL engine can't parse it; dedupe in JS below.
      pool.query("SELECT master_id FROM checklist_completions WHERE date = ?", [today]),
    ]);

    const totalTasks    = dels.length;
    const doneTasks     = dels.filter(d => d.status === 'done').length;
    const pendingTasks  = dels.filter(d => d.status === 'pending').length;
    const reviseTasks   = dels.filter(d => d.status === 'revise' || d.status === 'revise_requested').length;
    const overdueTasks  = dels.filter(d =>
      d.status !== 'done' && d.due_date && new Date(d.due_date) < now
    ).length;

    const totalChecklists = masters.length;
    const doneChecklists  = new Set(chkToday.map((c) => c.master_id)).size;

    return NextResponse.json({
      totalTasks,
      doneTasks,
      pendingTasks,
      reviseTasks,
      overdueTasks,
      totalChecklists,
      doneChecklists,
      activeUsers: users.length,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

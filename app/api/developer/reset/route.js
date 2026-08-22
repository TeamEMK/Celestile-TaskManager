import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { createBackup } from '../backups/route';
import { requireDeveloper } from '@/lib/api';

export async function POST(req) {
  const gate = requireDeveloper(req); if (gate) return gate;

  try {
    // Auto-backup before delete
    const backupId = await createBackup('Before Delete All Tasks').catch(() => null);

    await pool.query('DELETE FROM checklist_completions');
    await pool.query('DELETE FROM delegations');
    await pool.query('DELETE FROM masters');
    return NextResponse.json({ success: true, backupId });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { readStore, writeStore, buildPlannedSteps } from '@/lib/store';

export async function GET() {
  const masters = await sql`
    SELECT 
      id,
      task,
      assigned_to as "assignedTo",
      frequency,
      created_at as "createdAt"
    FROM masters 
    ORDER BY created_at DESC
  `;
  return NextResponse.json(masters);
}

export async function POST(req) {
  const body = await req.json();
  if (!body.clientName || !body.clientName.trim()) {
    return NextResponse.json({ error: 'Client name required' }, { status: 400 });
  }

  const store = await readStore();
  const entry = {
    id: 'FMS' + Date.now(),
    createdAt: new Date().toISOString(),
    clientName: body.clientName.trim(),
    platforms: body.platforms || '',
    mobile: body.mobile || '',
    doer: body.doer || '',
    steps: buildPlannedSteps(new Date()),
  };
  store.fms = store.fms || [];
  store.fms.push(entry);
  await writeStore(store);
  return NextResponse.json(entry, { status: 201 });
}

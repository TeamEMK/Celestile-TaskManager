import { NextResponse } from 'next/server';
import { readStore, writeStore } from '@/lib/store';

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store.masters || []);
}

export async function POST(req) {
  const body = await req.json();
  if (!body.task || !body.task.trim()) {
    return NextResponse.json({ error: 'Task required' }, { status: 400 });
  }
  const store = await readStore();
  store.masters = store.masters || [];
  const id = 'CHK' + (store.masters.length + 1).toString().padStart(3, '0');
  store.masters.push({
    id,
    task: body.task.trim(),
    assignedTo: body.assignedTo || '',
    frequency: body.frequency || 'Daily',
    createdAt: new Date().toISOString(),
  });
  await writeStore(store);
  return NextResponse.json({ success: true, id }, { status: 201 });
}

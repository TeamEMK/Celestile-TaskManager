import { NextResponse } from 'next/server';
import { readStore, writeStore } from '@/lib/store';

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store.delegations || []);
}

export async function POST(req) {
  const body = await req.json();
  if (!body.description || !body.doerId || !body.dueDate) {
    return NextResponse.json({ error: 'description, doerId, dueDate required' }, { status: 400 });
  }
  const store = await readStore();
  const doer = (store.users || []).find((u) => u.id === body.doerId);
  store.delegations = store.delegations || [];
  const id = 'DEL' + (store.delegations.length + 1).toString().padStart(3, '0');
  const entry = {
    id,
    description: body.description.trim(),
    doerId: body.doerId,
    doer: doer?.name || '',
    delegatedBy: body.delegatedBy || 'U001',
    dueDate: body.dueDate,
    client: body.client || '',
    status: 'pending',
    type: 'delegation',
    createdAt: new Date().toISOString(),
  };
  store.delegations.push(entry);
  await writeStore(store);
  return NextResponse.json(entry, { status: 201 });
}

export async function PATCH(req) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const store = await readStore();
  const idx = (store.delegations || []).findIndex((d) => d.id === body.id);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  store.delegations[idx] = { ...store.delegations[idx], ...body };
  if (body.status === 'done' && !store.delegations[idx].completedAt) {
    store.delegations[idx].completedAt = new Date().toISOString();
  }
  await writeStore(store);
  return NextResponse.json(store.delegations[idx]);
}

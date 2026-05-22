import { NextResponse } from 'next/server';
import { readStore, writeStore } from '@/lib/store';

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store.users || []);
}

export async function POST(req) {
  const body = await req.json();
  if (!body.name || !body.email) return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
  const store = await readStore();
  store.users = store.users || [];
  const id = 'U' + (store.users.length + 1).toString().padStart(3, '0');
  const user = {
    id,
    name: body.name.trim(),
    email: body.email.trim(),
    phone: body.phone || '',
    department: body.department || '',
    roles: body.roles && body.roles.length ? body.roles : ['User'],
    active: true,
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  await writeStore(store);
  return NextResponse.json(user, { status: 201 });
}

export async function PATCH(req) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const store = await readStore();
  const idx = (store.users || []).findIndex((u) => u.id === body.id);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  store.users[idx] = { ...store.users[idx], ...body };
  await writeStore(store);
  return NextResponse.json(store.users[idx]);
}

export async function DELETE(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const store = await readStore();
  store.users = (store.users || []).filter((u) => u.id !== id);
  await writeStore(store);
  return NextResponse.json({ success: true });
}

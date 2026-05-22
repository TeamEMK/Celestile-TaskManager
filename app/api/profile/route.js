import { NextResponse } from 'next/server';
import { readStore, writeStore } from '@/lib/store';

export async function PATCH(req) {
  const body = await req.json();
  const store = await readStore();
  const profile = store.profile || {};
  const userId = profile.userId;
  const idx = (store.users || []).findIndex((u) => u.id === userId);
  if (idx !== -1) {
    store.users[idx] = {
      ...store.users[idx],
      name: body.name || store.users[idx].name,
      email: body.email || store.users[idx].email,
      phone: body.phone || store.users[idx].phone,
    };
  }
  store.profile = { ...profile, notificationEmail: body.notificationEmail || '' };
  // Password update (would normally hash + verify - skipping for demo)
  await writeStore(store);
  return NextResponse.json({ success: true });
}

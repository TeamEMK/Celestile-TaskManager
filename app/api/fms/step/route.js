import { NextResponse } from 'next/server';
import { readStore, writeStore } from '@/lib/store';

export async function POST(req) {
  const { fmsId, stepIndex } = await req.json();
  const store = await readStore();
  const entry = (store.fms || []).find((f) => f.id === fmsId);
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!entry.steps[stepIndex]) return NextResponse.json({ error: 'Invalid step' }, { status: 400 });

  entry.steps[stepIndex].actual = new Date().toISOString();
  await writeStore(store);
  return NextResponse.json({ success: true });
}

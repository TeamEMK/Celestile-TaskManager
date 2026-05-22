import { NextResponse } from 'next/server';
import { readStore, computeDashboard } from '@/lib/store';

export async function GET() {
  const store = await readStore();
  return NextResponse.json(computeDashboard(store));
}

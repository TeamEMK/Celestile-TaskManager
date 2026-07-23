import { NextResponse } from 'next/server';
import { requireUser, currentUser } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { getFmsSheetsWithStats } from '@/lib/fmsSheet';

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const user = await currentUser();
    const sheets = await getFmsSheetsWithStats(user.id, isAdminRoles(user.roles));
    return NextResponse.json(sheets);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

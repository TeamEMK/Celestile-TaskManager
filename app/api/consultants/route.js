import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { upsertConsultant } from '@/app/api/quotations/route';
import { requireUser } from '@/lib/api';

async function listConsultants() {
  const [rows] = await pool.query('SELECT name, mobile, email FROM consultants');
  return (rows || [])
    .filter((r) => String(r.name || '').trim())
    .map((r) => ({ name: String(r.name).trim(), mobile: String(r.mobile || '').trim(), email: String(r.email || '').trim() }));
}

export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const list = await listConsultants();

    // ?me=1 → consultant matching the logged-in user's email (getCurrentUserConsultant)
    if (new URL(req.url).searchParams.get('me')) {
      const session = await getServerSession(authOptions);
      const email = (session?.user?.email || '').toLowerCase().trim();
      if (!email) return NextResponse.json(null);
      const found = list.find((c) => c.email && c.email.toLowerCase() === email);
      return NextResponse.json(found || { name: '', mobile: '', email: session.user.email, notFound: true });
    }

    return NextResponse.json({ list });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const { name, mobile, email } = await req.json();
    if (!String(name || '').trim()) return NextResponse.json({ status: 'error', message: 'Name required' }, { status: 400 });
    await upsertConsultant(name, mobile, email);
    return NextResponse.json({ status: 'success', name, mobile, email });
  } catch (err) {
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}

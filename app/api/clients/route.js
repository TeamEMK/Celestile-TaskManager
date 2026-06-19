import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const [rows] = await pool.query(
      `SELECT id, name, contact_person AS contactPerson, contact_number AS contactNumber,
              email, industry, status, notes, created_at AS createdAt
       FROM clients ORDER BY created_at DESC`
    );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const b = await req.json();
    if (!b.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const [c] = await pool.query('SELECT COUNT(*) AS cnt FROM clients');
    const id  = 'CL' + (Number(c[0].cnt) + 1).toString().padStart(4, '0');
    await pool.query(
      'INSERT INTO clients (id, name, contact_person, contact_number, email, industry, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, b.name.trim(), b.contactPerson || '', b.contactNumber || '', b.email || '', b.industry || '', b.status || 'active', b.notes || '']
    );
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await pool.query(
      `UPDATE clients SET
        name           = COALESCE(?, name),
        contact_person = COALESCE(?, contact_person),
        contact_number = COALESCE(?, contact_number),
        email          = COALESCE(?, email),
        industry       = COALESCE(?, industry),
        status         = COALESCE(?, status),
        notes          = COALESCE(?, notes)
       WHERE id = ?`,
      [b.name ?? null, b.contactPerson ?? null, b.contactNumber ?? null,
       b.email ?? null, b.industry ?? null, b.status ?? null, b.notes ?? null, b.id]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await pool.query('DELETE FROM clients WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

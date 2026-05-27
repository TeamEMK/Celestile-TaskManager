import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export async function GET() {
  try {
    const rows = await sql`
      SELECT id, name, contact_person AS "contactPerson", contact_number AS "contactNumber",
             email, industry, status, notes, created_at AS "createdAt"
      FROM clients ORDER BY created_at DESC`;
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const b = await req.json();
    if (!b.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const countRes = await sql`SELECT COUNT(*) FROM clients`;
    const id = 'CL' + (Number(countRes[0].count) + 1).toString().padStart(4, '0');
    await sql`
      INSERT INTO clients (id, name, contact_person, contact_number, email, industry, status, notes)
      VALUES (${id}, ${b.name.trim()}, ${b.contactPerson || ''}, ${b.contactNumber || ''},
              ${b.email || ''}, ${b.industry || ''}, ${b.status || 'active'}, ${b.notes || ''})`;
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await sql`
      UPDATE clients SET
        name = COALESCE(${b.name}, name),
        contact_person = COALESCE(${b.contactPerson}, contact_person),
        contact_number = COALESCE(${b.contactNumber}, contact_number),
        email = COALESCE(${b.email}, email),
        industry = COALESCE(${b.industry}, industry),
        status = COALESCE(${b.status}, status),
        notes = COALESCE(${b.notes}, notes)
      WHERE id = ${b.id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await sql`DELETE FROM clients WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

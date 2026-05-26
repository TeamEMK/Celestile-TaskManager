import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export async function GET() {
  const users = await sql`SELECT * FROM users ORDER BY id`;
  return NextResponse.json(users);
}

export async function POST(req) {
  const body = await req.json();
  if (!body.name || !body.email)
    return NextResponse.json({ error: 'Name and email required' }, { status: 400 });

  // Auto ID generate karo
  const last = await sql`SELECT id FROM users ORDER BY id DESC LIMIT 1`;
  const lastNum = last.length ? parseInt(last[0].id.replace('U', '')) : 0;
  const id = 'U' + (lastNum + 1).toString().padStart(3, '0');

  const roles = body.roles && body.roles.length ? body.roles : ['User'];

  const result = await sql`
    INSERT INTO users (id, name, email, phone, department, roles, active, created_at)
    VALUES (
      ${id}, ${body.name.trim()}, ${body.email.trim()},
      ${body.phone || ''}, ${body.department || ''},
      ${roles}, true, NOW()
    )
    RETURNING *
  `;
  return NextResponse.json(result[0], { status: 201 });
}

export async function PATCH(req) {
  const body = await req.json();
  if (!body.id)
    return NextResponse.json({ error: 'id required' }, { status: 400 });

  const result = await sql`
    UPDATE users SET
      name = COALESCE(${body.name}, name),
      email = COALESCE(${body.email}, email),
      phone = COALESCE(${body.phone}, phone),
      department = COALESCE(${body.department}, department),
      roles = COALESCE(${body.roles}, roles),
      active = COALESCE(${body.active}, active)
    WHERE id = ${body.id}
    RETURNING *
  `;
  if (!result.length)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(result[0]);
}

export async function DELETE(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id)
    return NextResponse.json({ error: 'id required' }, { status: 400 });

  await sql`DELETE FROM users WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
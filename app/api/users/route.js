import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { syncUsers } from '@/lib/google-sheets';
import { sql } from '@/lib/mysql-sql';

export async function GET() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM users ORDER BY id');
  return NextResponse.json(rows);
}

export async function POST(req) {
  await ensureSchema();
  const body = await req.json();
  if (!body.name || !body.email)
    return NextResponse.json({ error: 'Name and email required' }, { status: 400 });

  const [last] = await pool.query('SELECT id FROM users ORDER BY id DESC LIMIT 1');
  const lastNum = last.length ? parseInt(last[0].id.replace('U', '')) : 0;
  const id = 'U' + (lastNum + 1).toString().padStart(3, '0');

  const roles = body.roles?.length ? body.roles : ['User'];
  await pool.query(
    'INSERT INTO users (id, name, email, phone, department, roles, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, NOW())',
    [id, body.name.trim(), body.email.trim(), body.phone || '', body.department || '', roles.join(',')]
  );

  const [result] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  syncUsers(sql).catch(() => {});
  return NextResponse.json(result[0], { status: 201 });
}

export async function PATCH(req) {
  await ensureSchema();
  const body = await req.json();
  if (!body.id)
    return NextResponse.json({ error: 'id required' }, { status: 400 });

  const roles = body.roles ? (Array.isArray(body.roles) ? body.roles.join(',') : body.roles) : null;
  await pool.query(
    `UPDATE users SET
      name       = COALESCE(?, name),
      email      = COALESCE(?, email),
      phone      = COALESCE(?, phone),
      department = COALESCE(?, department),
      roles      = COALESCE(?, roles),
      active     = COALESCE(?, active)
     WHERE id = ?`,
    [body.name ?? null, body.email ?? null, body.phone ?? null,
     body.department ?? null, roles, body.active ?? null, body.id]
  );

  const [result] = await pool.query('SELECT * FROM users WHERE id = ?', [body.id]);
  if (!result.length)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  syncUsers(sql).catch(() => {});
  return NextResponse.json(result[0]);
}

export async function DELETE(req) {
  await ensureSchema();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await pool.query('DELETE FROM users WHERE id = ?', [id]);
  syncUsers(sql).catch(() => {});
  return NextResponse.json({ success: true });
}

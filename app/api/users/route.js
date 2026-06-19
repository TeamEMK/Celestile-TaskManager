import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { requireUser, requireAdmin } from '@/lib/api';

function parseRoles(role, userRole) {
  const combined = [role, userRole].join(',').toLowerCase();
  const roles = [];
  if (combined.includes('admin')) roles.push('Admin');
  if (combined.includes('hod'))   roles.push('HOD');
  if (combined.includes('user'))  roles.push('User');
  return roles.length ? roles : ['User'];
}

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM users ORDER BY id');
  return NextResponse.json(rows);
}

export async function POST(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const body = await req.json();
    await ensureSchema();

    // Bulk upload
    if (Array.isArray(body.bulk)) {
      let inserted = 0; const errors = [];
      for (const [i, row] of body.bulk.entries()) {
        const name  = (row.name  || '').trim();
        const email = (row.email || '').trim().toLowerCase();
        if (!name || !email) { errors.push(`Row ${i+1}: name/email missing`); continue; }
        const [ex] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (ex.length) { errors.push(`Row ${i+1}: ${email} already exists`); continue; }
        const [last] = await pool.query('SELECT id FROM users ORDER BY id DESC LIMIT 1');
        const lastNum = last.length ? parseInt((last[0].id || 'U000').replace('U','')) || 0 : 0;
        const id = 'U' + (lastNum + 1).toString().padStart(3, '0');
        const roles = parseRoles(row.role || '', row.user_role || '');
        const hash = row.password ? await bcrypt.hash(row.password, 10) : null;
        await pool.query(
          'INSERT INTO users (id,name,email,phone,department,roles,active,password_hash,created_at) VALUES (?,?,?,?,?,?,1,?,NOW())',
          [id, name, email, row.phone||'', row.department||'', roles.join(','), hash]
        );
        inserted++;
      }
      return NextResponse.json({ success: true, inserted, errors }, { status: 201 });
    }

    if (!body.name || !body.email)
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });

    const [last] = await pool.query('SELECT id FROM users ORDER BY id DESC LIMIT 1');
    const lastNum = last.length ? parseInt(last[0].id.replace('U', '')) : 0;
    const id = 'U' + (lastNum + 1).toString().padStart(3, '0');
    const roles = body.roles?.length ? body.roles : ['User'];
    const hash = body.password ? await bcrypt.hash(body.password, 10) : null;
    await pool.query(
      'INSERT INTO users (id, name, email, phone, department, roles, active, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW())',
      [id, body.name.trim(), body.email.trim(), body.phone || '', body.department || '', roles.join(','), hash]
    );
    if (body.picture) {
      await pool.query('UPDATE users SET picture = ? WHERE id = ?', [body.picture, id]);
    }
    const [result] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const body = await req.json();
    if (!body.id)
      return NextResponse.json({ error: 'id required' }, { status: 400 });

    await ensureSchema();
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
    if (body.picture !== undefined) {
      await pool.query('UPDATE users SET picture = ? WHERE id = ?', [body.picture, body.id]);
    }
    const [result] = await pool.query('SELECT * FROM users WHERE id = ?', [body.id]);
    if (!result.length)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(result[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await ensureSchema();
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

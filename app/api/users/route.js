import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { syncUsers } from '@/lib/google-sheets';
import { sql } from '@/lib/mysql-sql';
import bcrypt from 'bcryptjs';

function parseRoles(role, userRole) {
  const combined = [role, userRole].join(',').toLowerCase();
  const roles = [];
  if (combined.includes('admin')) roles.push('Admin');
  if (combined.includes('hod'))   roles.push('HOD');
  if (combined.includes('user'))  roles.push('User');
  return roles.length ? roles : ['User'];
}

const hasDB = !!process.env.DB_HOST;

async function getStore() {
  const { readStore, writeStore } = await import('@/lib/store');
  return { readStore, writeStore };
}

export async function GET() {
  if (!hasDB) {
    const { readStore } = await getStore();
    const store = await readStore();
    return NextResponse.json(store.users || []);
  }
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM users ORDER BY id');
  return NextResponse.json(rows);
}

export async function POST(req) {
  const body = await req.json();

  // Bulk upload
  if (Array.isArray(body.bulk)) {
    await ensureSchema();
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
    syncUsers(sql).catch(()=>{});
    return NextResponse.json({ success: true, inserted, errors }, { status: 201 });
  }

  if (!body.name || !body.email)
    return NextResponse.json({ error: 'Name and email required' }, { status: 400 });

  if (!hasDB) {
    const { readStore, writeStore } = await getStore();
    const store = await readStore();
    const users = store.users || [];
    if (users.find(u => u.email === body.email))
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    const lastNum = users.reduce((max, u) => {
      const n = parseInt((u.id || '').replace('U', '')) || 0;
      return n > max ? n : max;
    }, 0);
    const id = 'U' + (lastNum + 1).toString().padStart(3, '0');
    const roles = body.roles?.length ? body.roles : ['User'];
    const newUser = {
      id, name: body.name.trim(), email: body.email.trim(),
      phone: body.phone || '', department: body.department || '',
      roles, active: true, createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    store.users = users;
    await writeStore(store);
    return NextResponse.json(newUser, { status: 201 });
  }

  await ensureSchema();
  const [last] = await pool.query('SELECT id FROM users ORDER BY id DESC LIMIT 1');
  const lastNum = last.length ? parseInt(last[0].id.replace('U', '')) : 0;
  const id = 'U' + (lastNum + 1).toString().padStart(3, '0');
  const roles = body.roles?.length ? body.roles : ['User'];
  const hash = body.password ? await bcrypt.hash(body.password, 10) : null;
  await pool.query(
    'INSERT INTO users (id, name, email, phone, department, roles, active, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW())',
    [id, body.name.trim(), body.email.trim(), body.phone || '', body.department || '', roles.join(','), hash]
  );
  const [result] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  syncUsers(sql).catch(() => {});
  return NextResponse.json(result[0], { status: 201 });
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    if (!body.id)
      return NextResponse.json({ error: 'id required' }, { status: 400 });

    if (!hasDB) {
      const { readStore, writeStore } = await getStore();
      const store = await readStore();
      const user = (store.users || []).find(u => u.id === body.id);
      if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (body.name       !== undefined) user.name       = body.name;
      if (body.email      !== undefined) user.email      = body.email;
      if (body.phone      !== undefined) user.phone      = body.phone;
      if (body.department !== undefined) user.department = body.department;
      if (body.roles      !== undefined) user.roles      = Array.isArray(body.roles) ? body.roles : body.roles.split(',').map(r => r.trim());
      if (body.active     !== undefined) user.active     = body.active;
      await writeStore(store);
      return NextResponse.json(user);
    }

    await ensureSchema();
    const roles = body.roles ? (Array.isArray(body.roles) ? body.roles.join(',') : body.roles) : null;
    // Update core fields (no picture — handled separately to avoid column-missing errors)
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
    // Picture update — add column first if missing, then update
    if (body.picture !== undefined) {
      try {
        await pool.query('ALTER TABLE users ADD COLUMN picture MEDIUMTEXT DEFAULT NULL');
      } catch { /* column already exists */ }
      await pool.query('UPDATE users SET picture = ? WHERE id = ?', [body.picture, body.id]);
    }
    const [result] = await pool.query('SELECT * FROM users WHERE id = ?', [body.id]);
    if (!result.length)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    syncUsers(sql).catch(() => {});
    return NextResponse.json(result[0]);
  } catch (err) {
    console.error('[PATCH /api/users]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (!hasDB) {
    const { readStore, writeStore } = await getStore();
    const store = await readStore();
    store.users = (store.users || []).filter(u => u.id !== id);
    await writeStore(store);
    return NextResponse.json({ success: true });
  }

  await ensureSchema();
  await pool.query('DELETE FROM users WHERE id = ?', [id]);
  syncUsers(sql).catch(() => {});
  return NextResponse.json({ success: true });
}

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createBackup } from '../backups/route';

function checkSecret(req) {
  const secret = req.nextUrl.searchParams.get('secret');
  return secret && secret === process.env.DEVELOPER_SECRET;
}

const NEW_ADMIN = {
  id:       'U001',
  name:     'Admin',
  email:    'admin@india-automotive.com',
  password: 'Admin@1234',
  roles:    'Admin',
};

export async function POST(req) {
  if (!checkSecret(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // mode: 'users' = delete non-admins only
    //        'admins' = delete admins only, create fresh admin
    //        'all'   = delete everyone, create fresh admin
    const { mode = 'all' } = await req.json();

    await createBackup(`Before Delete Users (mode: ${mode})`).catch(() => null);

    if (!process.env.DB_HOST) {
      const { readStore, writeStore } = await import('@/lib/store');
      const store = await readStore();
      const isAdmin = (u) => {
        const r = Array.isArray(u.roles) ? u.roles : String(u.roles || '').split(',');
        return r.map(x => x.trim()).includes('Admin');
      };
      if (mode === 'users')  store.users = (store.users || []).filter(isAdmin);
      if (mode === 'admins') store.users = (store.users || []).filter(u => !isAdmin(u));
      if (mode === 'all')    store.users = [];
      if (mode !== 'users') {
        const hash = await bcrypt.hash(NEW_ADMIN.password, 10);
        store.users.push({ id: NEW_ADMIN.id, name: NEW_ADMIN.name, email: NEW_ADMIN.email, phone: '', department: 'Administration', roles: ['Admin'], active: true, createdAt: new Date().toISOString() });
        await writeStore(store);
        return NextResponse.json({ success: true, admin: { email: NEW_ADMIN.email, password: NEW_ADMIN.password } });
      }
      await writeStore(store);
      return NextResponse.json({ success: true });
    }

    if (mode === 'users') {
      await pool.query("DELETE FROM users WHERE FIND_IN_SET('Admin', roles) = 0");
      return NextResponse.json({ success: true });
    }

    if (mode === 'admins') {
      await pool.query("DELETE FROM users WHERE FIND_IN_SET('Admin', roles) > 0");
    } else {
      // all
      await pool.query('DELETE FROM users');
    }

    // Create fresh admin for 'admins' and 'all' modes
    const hash = await bcrypt.hash(NEW_ADMIN.password, 10);
    await pool.query(
      'INSERT INTO users (id, name, email, phone, department, roles, active, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW())',
      [NEW_ADMIN.id, NEW_ADMIN.name, NEW_ADMIN.email, '', 'Administration', NEW_ADMIN.roles, hash]
    );
    return NextResponse.json({ success: true, admin: { email: NEW_ADMIN.email, password: NEW_ADMIN.password } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

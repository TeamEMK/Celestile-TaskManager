import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key');
  if (key !== 'migrate-india-auto-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureSchema();

    const storePath = path.join(process.cwd(), 'data', 'store.json');
    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));

    const results = { users: 0, delegations: 0, masters: 0, holidays: 0, errors: [] };

    // Users
    for (const u of (store.users || [])) {
      try {
        const roles = Array.isArray(u.roles) ? u.roles.join(',') : (u.roles || 'User');
        await pool.query(
          `INSERT INTO users (id, name, email, phone, department, roles, active, password_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             name=VALUES(name), email=VALUES(email), phone=VALUES(phone),
             department=VALUES(department), roles=VALUES(roles), active=VALUES(active),
             password_hash=VALUES(password_hash)`,
          [u.id, u.name, u.email, u.phone || '', u.department || '',
           roles, u.active !== false ? 1 : 0,
           u.password_hash || null,
           u.createdAt ? new Date(u.createdAt) : new Date()]
        );
        results.users++;
      } catch (e) { results.errors.push(`User ${u.id}: ${e.message}`); }
    }

    // Delegations
    for (const d of (store.delegations || [])) {
      try {
        const validStatuses = ['pending','done','revise','revise_requested','approval_pending'];
        const status = validStatuses.includes(d.status) ? d.status : 'pending';
        await pool.query(
          `INSERT INTO delegations (id, description, doer_id, doer, delegated_by, due_date, client,
             status, type, priority, approval, url, remarks, revise_action,
             transferred_by, transferred_from, created_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status=VALUES(status)`,
          [d.id, d.description, d.doerId || null, d.doer || '',
           d.delegatedBy || null, d.dueDate || null, d.client || '',
           status, d.type || 'delegation',
           d.priority || 'Low', d.approval || 'No Approval',
           d.url || '', d.remarks || '',
           d.reviseAction || null,
           d.transferredBy || null, d.transferredFrom || null,
           d.createdAt ? new Date(d.createdAt) : new Date(),
           d.completedAt ? new Date(d.completedAt) : null]
        );
        results.delegations++;
      } catch (e) { results.errors.push(`Del ${d.id}: ${e.message}`); }
    }

    // Masters
    for (const m of (store.masters || [])) {
      try {
        await pool.query(
          `INSERT INTO masters (id, task, assigned_to, frequency, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE task=VALUES(task), assigned_to=VALUES(assigned_to)`,
          [m.id, m.task, m.assignedTo || '', m.frequency || 'Daily',
           m.createdAt ? new Date(m.createdAt) : new Date()]
        );
        results.masters++;
      } catch (e) { results.errors.push(`Master ${m.id}: ${e.message}`); }
    }

    // Holidays
    for (const h of (store.holidays || [])) {
      try {
        await pool.query(
          `INSERT INTO holidays (id, date, name, type) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name=VALUES(name)`,
          [h.id, h.date, h.name, h.type || '']
        );
        results.holidays++;
      } catch (e) { results.errors.push(`Holiday ${h.id}: ${e.message}`); }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

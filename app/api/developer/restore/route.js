import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

function checkSecret(req) {
  const secret = req.nextUrl.searchParams.get('secret');
  return secret && secret === process.env.DEVELOPER_SECRET;
}

export async function POST(req) {
  if (!checkSecret(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'Backup ID required' }, { status: 400 });

    const [rows] = await pool.query(
      'SELECT data, expires_at FROM dev_backups WHERE id = ?', [id]
    );
    if (!rows.length)
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });

    const now = new Date();
    if (new Date(rows[0].expires_at) < now)
      return NextResponse.json({ error: 'Backup expired (older than 15 days)' }, { status: 410 });

    const backup = JSON.parse(rows[0].data);
    await ensureSchema();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Restore delegations
      await conn.query('DELETE FROM delegations');
      if (backup.delegations?.length) {
        for (const d of backup.delegations) {
          await conn.query(
            `INSERT IGNORE INTO delegations
             (id, description, doer_id, doer, delegated_by, due_date, client, status, type,
              priority, approval, url, remarks, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [d.id, d.description, d.doer_id||null, d.doer||'', d.delegated_by||null,
             d.due_date||null, d.client||'', d.status||'pending', d.type||'delegation',
             d.priority||'Low', d.approval||'No Approval', d.url||'', d.remarks||'',
             d.created_at||new Date()]
          );
        }
      }

      // Restore masters
      await conn.query('DELETE FROM masters');
      if (backup.masters?.length) {
        for (const m of backup.masters) {
          await conn.query(
            'INSERT IGNORE INTO masters (id, task, assigned_to, frequency, created_at) VALUES (?,?,?,?,?)',
            [m.id, m.task, m.assigned_to||'', m.frequency||'Daily', m.created_at||new Date()]
          );
        }
      }

      // Restore users
      await conn.query('DELETE FROM users');
      if (backup.users?.length) {
        for (const u of backup.users) {
          await conn.query(
            `INSERT IGNORE INTO users
             (id, name, email, phone, department, roles, active, password_hash, created_at)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [u.id, u.name, u.email, u.phone||'', u.department||'',
             u.roles||'User', u.active??1, u.password_hash||null, u.created_at||new Date()]
          );
        }
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

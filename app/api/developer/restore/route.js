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

    const [rows] = await pool.query('SELECT data FROM dev_backups WHERE id = ?', [id]);
    if (!rows.length)
      return NextResponse.json({ error: 'Backup not found or expired' }, { status: 404 });

    const backup = JSON.parse(rows[0].data);
    await ensureSchema();

    // ── Restore Delegations ──
    await pool.query('DELETE FROM delegations');
    if (backup.delegations?.length) {
      for (const d of backup.delegations) {
        await pool.query(
          `INSERT INTO delegations
           (id, description, doer_id, doer, delegated_by, due_date, client, status, type,
            priority, approval, url, remarks, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE status = VALUES(status)`,
          [
            d.id          || '',
            d.description || '',
            d.doer_id     || null,
            d.doer        || '',
            d.delegated_by|| null,
            d.due_date    || null,
            d.client      || '',
            ['pending','done','revise','revise_requested','approval_pending'].includes(d.status)
              ? d.status : 'pending',
            d.type        || 'delegation',
            d.priority    || 'Low',
            d.approval    || 'No Approval',
            d.url         || '',
            d.remarks     || '',
            d.created_at  || new Date(),
          ]
        ).catch(() => {});  // skip individual row errors
      }
    }

    // ── Restore Masters ──
    await pool.query('DELETE FROM masters');
    if (backup.masters?.length) {
      for (const m of backup.masters) {
        await pool.query(
          `INSERT INTO masters (id, task, assigned_to, frequency, created_at)
           VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE task = VALUES(task)`,
          [m.id, m.task || '', m.assigned_to || '', m.frequency || 'Daily', m.created_at || new Date()]
        ).catch(() => {});
      }
    }

    // ── Restore Users ──
    await pool.query('DELETE FROM users');
    if (backup.users?.length) {
      for (const u of backup.users) {
        await pool.query(
          `INSERT INTO users (id, name, email, phone, department, roles, active, password_hash, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE name = VALUES(name)`,
          [
            u.id           || '',
            u.name         || '',
            u.email        || '',
            u.phone        || '',
            u.department   || '',
            u.roles        || 'User',
            u.active != null ? u.active : 1,
            u.password_hash|| null,
            u.created_at   || new Date(),
          ]
        ).catch(() => {});
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Restore]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

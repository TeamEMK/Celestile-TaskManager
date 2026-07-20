import { pool, q, ensureSchema, toIso, toDateStr } from './db-postgres.js';

function userOut(r) {
  let roles;
  if (Array.isArray(r.roles)) {
    roles = r.roles;
  } else if (typeof r.roles === 'string') {
    roles = r.roles.split(',').map((x) => x.trim()).filter(Boolean);
  } else {
    roles = ['User'];
  }
  return {
    id: r.id, name: r.name, email: r.email,
    phone: r.phone || '', department: r.department || '',
    roles,
    active: !!r.active,
    createdAt: toIso(r.created_at),
  };
}
function delegationOut(r) {
  return {
    id: r.id, description: r.description,
    doerId: r.doer_id, doer: r.doer, delegatedBy: r.delegated_by,
    dueDate: toDateStr(r.due_date),
    client: r.client || '', status: r.status,
    // Normalize type to capital D — DB stores 'delegation' (lowercase)
    type: r.type ? (r.type.charAt(0).toUpperCase() + r.type.slice(1)) : 'Delegation',
    priority: r.priority || 'Low',
    approval: r.approval || 'No Approval',
    approverId: r.approver_id || null,
    approver: r.approver || '',
    remarks: r.remarks || '',
    createdAt: toIso(r.created_at),
    completedAt: toIso(r.completed_at),
  };
}
function masterOut(r) {
  return { id: r.id, task: r.task, assignedTo: r.assigned_to || '', frequency: r.frequency, createdAt: toIso(r.created_at) };
}
function holidayOut(r) {
  return { id: r.id, date: toDateStr(r.date), name: r.name, type: r.type || '' };
}

export async function readStoreDb() {
  await ensureSchema();
  const [users, delegations, masters, holidays, profileRows] = await Promise.all([
    q('SELECT * FROM users ORDER BY id ASC'),
    q('SELECT * FROM delegations ORDER BY id ASC'),
    q('SELECT * FROM masters ORDER BY id ASC'),
    q('SELECT * FROM holidays ORDER BY date ASC'),
    q('SELECT * FROM profile LIMIT 1'),
  ]);

  const profile = profileRows[0]
    ? { userId: profileRows[0].user_id, notificationEmail: profileRows[0].notification_email || '' }
    : { userId: null, notificationEmail: '' };

  return {
    users: users.map(userOut),
    delegations: delegations.map(delegationOut),
    masters: masters.map(masterOut),
    holidays: holidays.map(holidayOut),
    approvals: { tasks: [], transfers: [], leaves: [] },
    profile,
  };
}

export async function writeStoreDb(data) {
  await ensureSchema();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    await c.query('DELETE FROM users');
    await c.query('DELETE FROM delegations');
    await c.query('DELETE FROM masters');
    await c.query('DELETE FROM holidays');
    await c.query('DELETE FROM profile');

    for (const u of data.users || []) {
      await c.query(
        `INSERT INTO users (id,name,email,phone,department,roles,active,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, NOW()))`,
        [
          u.id, u.name, u.email, u.phone || '', u.department || '',
          (u.roles && u.roles.length ? u.roles : ['User']).join(','),
          u.active === false ? false : true,
          u.createdAt || null,
        ]
      );
    }

    for (const d of data.delegations || []) {
      await c.query(
        `INSERT INTO delegations (id,description,doer_id,doer,delegated_by,due_date,client,status,type,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz, NOW()))`,
        [
          d.id, d.description, d.doerId || null, d.doer || '',
          d.delegatedBy || null, d.dueDate || null,
          d.client || '', d.status || 'pending', d.type || 'delegation',
          d.createdAt || null,
        ]
      );
    }

    for (const m of data.masters || []) {
      await c.query(
        `INSERT INTO masters (id,task,assigned_to,frequency,created_at)
         VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz, NOW()))`,
        [m.id, m.task, m.assignedTo || '', m.frequency || 'Daily', m.createdAt || null]
      );
    }

    for (const h of data.holidays || []) {
      await c.query(
        `INSERT INTO holidays (id,date,name,type) VALUES ($1,$2,$3,$4)`,
        [h.id, h.date, h.name, h.type || '']
      );
    }

    if (data.profile?.userId) {
      await c.query(
        `INSERT INTO profile (user_id,notification_email) VALUES ($1,$2)`,
        [data.profile.userId, data.profile.notificationEmail || '']
      );
    }

    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

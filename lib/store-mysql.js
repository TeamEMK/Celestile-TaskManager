import { pool, q, ensureSchema, toMysqlDate, toMysqlDateTime, fromMysqlDate, fromMysqlDateTime } from './db.js';

function userOut(r) {
  return {
    id: r.id, name: r.name, email: r.email,
    phone: r.phone || '', department: r.department || '', branch: r.branch || '',
    roles: (r.roles || 'User').split(',').map((x) => x.trim()).filter(Boolean),
    active: !!r.active,
    picture: r.picture || null,
    createdAt: fromMysqlDateTime(r.created_at),
  };
}
function delegationOut(r) {
  return {
    id: r.id, description: r.description,
    doerId: r.doer_id, doer: r.doer, delegatedBy: r.delegated_by,
    dueDate: fromMysqlDate(r.due_date),
    client: r.client || '', status: r.status, type: r.type,
    priority: r.priority || 'Low',
    url: r.url || '',
    remarks: r.remarks || '',
    approval: r.approval || 'No Approval',
    approverId: r.approver_id || null,
    approver: r.approver || '',
    requireFile: !!r.require_file,
    image: r.image || '',
    attachment: r.attachment || '',
    transferredBy:   r.transferred_by   || null,
    transferredFrom: r.transferred_from || null,
    createdAt: fromMysqlDateTime(r.created_at),
  };
}
function masterOut(r) {
  const sd = r.start_date;
  const startDate = sd ? (sd instanceof Date ? sd.toISOString().slice(0, 10) : String(sd).slice(0, 10)) : null;
  return {
    id: r.id, task: r.task, assignedTo: r.assigned_to || '', frequency: r.frequency, startDate,
    requireFile: !!r.require_file, attachment: r.attachment || '',
    createdAt: fromMysqlDateTime(r.created_at),
  };
}
function holidayOut(r) {
  return { id: r.id, date: fromMysqlDate(r.date), name: r.name, type: r.type || '' };
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
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query('DELETE FROM users');
    await conn.query('DELETE FROM delegations');
    await conn.query('DELETE FROM masters');
    await conn.query('DELETE FROM holidays');
    await conn.query('DELETE FROM profile');

    if (data.users?.length) {
      const rows = data.users.map((u) => [
        u.id, u.name, u.email, u.phone || '', u.department || '',
        (u.roles && u.roles.length ? u.roles : ['User']).join(','),
        u.active === false ? 0 : 1,
        toMysqlDateTime(u.createdAt) || toMysqlDateTime(new Date().toISOString()),
      ]);
      await conn.query('INSERT INTO users (id,name,email,phone,department,roles,active,created_at) VALUES ?', [rows]);
    }

    if (data.delegations?.length) {
      const rows = data.delegations.map((d) => [
        d.id, d.description, d.doerId || null, d.doer || '',
        d.delegatedBy || null, toMysqlDate(d.dueDate),
        d.client || '', d.status || 'pending', d.type || 'delegation',
        toMysqlDateTime(d.createdAt) || toMysqlDateTime(new Date().toISOString()),
      ]);
      await conn.query('INSERT INTO delegations (id,description,doer_id,doer,delegated_by,due_date,client,status,type,created_at) VALUES ?', [rows]);
    }

    if (data.masters?.length) {
      const rows = data.masters.map((m) => [
        m.id, m.task, m.assignedTo || '', m.frequency || 'Daily',
        toMysqlDateTime(m.createdAt) || toMysqlDateTime(new Date().toISOString()),
      ]);
      await conn.query('INSERT INTO masters (id,task,assigned_to,frequency,created_at) VALUES ?', [rows]);
    }

    if (data.holidays?.length) {
      const rows = data.holidays.map((h) => [h.id, toMysqlDate(h.date), h.name, h.type || '']);
      await conn.query('INSERT INTO holidays (id,date,name,type) VALUES ?', [rows]);
    }

    if (data.profile?.userId) {
      await conn.query('INSERT INTO profile (user_id,notification_email) VALUES (?,?)', [data.profile.userId, data.profile.notificationEmail || '']);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

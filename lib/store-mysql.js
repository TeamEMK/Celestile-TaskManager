import { pool, q, ensureSchema, toMysqlDate, toMysqlDateTime, fromMysqlDate, fromMysqlDateTime } from './db.js';
import { FMS_STEPS } from './store.js';

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
    requireFile: !!r.require_file,
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
function fmsOut(r, steps) {
  return {
    id: r.id, clientName: r.client_name,
    platforms: r.platforms || '', mobile: r.mobile || '', doer: r.doer || '',
    createdAt: fromMysqlDateTime(r.created_at),
    steps: steps.map((s) => ({
      planned: fromMysqlDateTime(s.planned),
      actual:  fromMysqlDateTime(s.actual),
    })),
  };
}

export async function readStoreDb() {
  await ensureSchema();
  const [users, delegations, masters, holidays, fmsRows, fmsStepRows, profileRows] = await Promise.all([
    q('SELECT * FROM users ORDER BY id ASC'),
    q('SELECT * FROM delegations ORDER BY id ASC'),
    q('SELECT * FROM masters ORDER BY id ASC'),
    q('SELECT * FROM holidays ORDER BY date ASC'),
    q('SELECT * FROM fms ORDER BY id ASC'),
    q('SELECT * FROM fms_steps ORDER BY fms_id ASC, step_index ASC'),
    q('SELECT * FROM profile LIMIT 1'),
  ]);

  const stepsByFms = new Map();
  for (const s of fmsStepRows) {
    if (!stepsByFms.has(s.fms_id)) stepsByFms.set(s.fms_id, []);
    stepsByFms.get(s.fms_id)[s.step_index] = s;
  }

  const fms = fmsRows.map((r) => {
    const steps = stepsByFms.get(r.id) || [];
    const dense = [];
    for (let i = 0; i < FMS_STEPS.length; i++) dense[i] = steps[i] || { planned: null, actual: null };
    return fmsOut(r, dense);
  });

  const profile = profileRows[0]
    ? { userId: profileRows[0].user_id, notificationEmail: profileRows[0].notification_email || '' }
    : { userId: null, notificationEmail: '' };

  return {
    users: users.map(userOut),
    delegations: delegations.map(delegationOut),
    masters: masters.map(masterOut),
    holidays: holidays.map(holidayOut),
    fms,
    approvals: { tasks: [], transfers: [], leaves: [] },
    profile,
  };
}

export async function writeStoreDb(data) {
  await ensureSchema();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query('DELETE FROM fms_steps');
    await conn.query('DELETE FROM fms');
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

    if (data.fms?.length) {
      const fmsRows = data.fms.map((f) => [
        f.id, f.clientName, f.platforms || '', f.mobile || '', f.doer || '',
        toMysqlDateTime(f.createdAt) || toMysqlDateTime(new Date().toISOString()),
      ]);
      await conn.query('INSERT INTO fms (id,client_name,platforms,mobile,doer,created_at) VALUES ?', [fmsRows]);

      const stepRows = [];
      for (const f of data.fms) {
        (f.steps || []).forEach((s, i) => {
          stepRows.push([f.id, i, toMysqlDateTime(s.planned), toMysqlDateTime(s.actual)]);
        });
      }
      if (stepRows.length) {
        await conn.query('INSERT INTO fms_steps (fms_id,step_index,planned,actual) VALUES ?', [stepRows]);
      }
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

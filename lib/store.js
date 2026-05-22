import { pool, q, ensureSchema, toMysqlDate, toMysqlDateTime, fromMysqlDate, fromMysqlDateTime } from './db.js';

export const FMS_STEPS = [
  { name: 'New Client Order Confirmation', who: 'Sales Team', how: 'Google Form' },
  { name: 'Draft Campaign Plan & Budgeting', who: 'Doer', how: 'Google Sheet' },
  { name: 'Plan Meeting & Get Plan Approved', who: 'Doer', how: 'Zoom + G-Sheets' },
  { name: 'KW Analysis + Grouping', who: 'Doer', how: 'Whatsapp' },
  { name: 'Receive Negative KW', who: 'Doer', how: 'G-Sheets' },
  { name: 'Ad Content', who: 'Content Team', how: 'Google Drive' },
  { name: 'Ad Content Approval', who: 'Doer', how: 'Ad Account' },
  { name: 'Make Campaigns Live', who: 'Doer', how: 'Ad Account' },
];

export const DEPARTMENTS = [
  'CXO', 'Business Automation', 'Social Media', 'Graphic Designing',
  'Google Ads', 'SEO', 'Meta Ads', 'Content Writing', 'AI',
  'Website Design & Development', 'MDO', 'eMarketing Accounts'
];

export const ROLES = ['Admin', 'User', 'HOD'];

// --- Row mappers ---
function userOut(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone || '',
    department: r.department || '',
    roles: (r.roles || 'User').split(',').map((x) => x.trim()).filter(Boolean),
    active: !!r.active,
    createdAt: fromMysqlDateTime(r.created_at),
  };
}
function delegationOut(r) {
  return {
    id: r.id,
    description: r.description,
    doerId: r.doer_id,
    doer: r.doer,
    delegatedBy: r.delegated_by,
    dueDate: fromMysqlDate(r.due_date),
    client: r.client || '',
    status: r.status,
    type: r.type,
    createdAt: fromMysqlDateTime(r.created_at),
  };
}
function masterOut(r) {
  return {
    id: r.id,
    task: r.task,
    assignedTo: r.assigned_to || '',
    frequency: r.frequency,
    createdAt: fromMysqlDateTime(r.created_at),
  };
}
function holidayOut(r) {
  return { id: r.id, date: fromMysqlDate(r.date), name: r.name, type: r.type || '' };
}
function fmsOut(r, steps) {
  return {
    id: r.id,
    clientName: r.client_name,
    platforms: r.platforms || '',
    mobile: r.mobile || '',
    doer: r.doer || '',
    createdAt: fromMysqlDateTime(r.created_at),
    steps: steps.map((s) => ({
      planned: fromMysqlDateTime(s.planned),
      actual: fromMysqlDateTime(s.actual),
    })),
  };
}

// --- Public API ---

export async function readStore() {
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
    // ensure dense array with length = FMS_STEPS.length
    const dense = [];
    for (let i = 0; i < FMS_STEPS.length; i++) {
      dense[i] = steps[i] || { planned: null, actual: null };
    }
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

export async function writeStore(data) {
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
      await conn.query(
        'INSERT INTO users (id,name,email,phone,department,roles,active,created_at) VALUES ?',
        [rows]
      );
    }

    if (data.delegations?.length) {
      const rows = data.delegations.map((d) => [
        d.id, d.description, d.doerId || null, d.doer || '',
        d.delegatedBy || null, toMysqlDate(d.dueDate),
        d.client || '', d.status || 'pending', d.type || 'delegation',
        toMysqlDateTime(d.createdAt) || toMysqlDateTime(new Date().toISOString()),
      ]);
      await conn.query(
        'INSERT INTO delegations (id,description,doer_id,doer,delegated_by,due_date,client,status,type,created_at) VALUES ?',
        [rows]
      );
    }

    if (data.masters?.length) {
      const rows = data.masters.map((m) => [
        m.id, m.task, m.assignedTo || '', m.frequency || 'Daily',
        toMysqlDateTime(m.createdAt) || toMysqlDateTime(new Date().toISOString()),
      ]);
      await conn.query(
        'INSERT INTO masters (id,task,assigned_to,frequency,created_at) VALUES ?',
        [rows]
      );
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
      await conn.query(
        'INSERT INTO fms (id,client_name,platforms,mobile,doer,created_at) VALUES ?',
        [fmsRows]
      );

      const stepRows = [];
      for (const f of data.fms) {
        (f.steps || []).forEach((s, i) => {
          stepRows.push([f.id, i, toMysqlDateTime(s.planned), toMysqlDateTime(s.actual)]);
        });
      }
      if (stepRows.length) {
        await conn.query(
          'INSERT INTO fms_steps (fms_id,step_index,planned,actual) VALUES ?',
          [stepRows]
        );
      }
    }

    if (data.profile?.userId) {
      await conn.query(
        'INSERT INTO profile (user_id,notification_email) VALUES (?,?)',
        [data.profile.userId, data.profile.notificationEmail || '']
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export function buildPlannedSteps(startDate = new Date()) {
  return FMS_STEPS.map((_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i + 1);
    return { planned: d.toISOString(), actual: null };
  });
}

export function computeDashboard(store, filter = 'all') {
  let total = 0, completed = 0, pending = 0, revised = 0;
  const items = [];
  const now = new Date();

  if (filter === 'all' || filter === 'delegation') {
    (store.delegations || []).forEach((d) => {
      total++;
      if (d.status === 'done') completed++;
      else if (d.status === 'revise') { pending++; revised++; }
      else {
        pending++;
        items.push({
          id: d.id, type: 'Delegation', description: d.description,
          doer: d.doer, date: d.dueDate, client: d.client || '-',
          overdue: new Date(d.dueDate) < now, status: 'pending',
        });
      }
    });
  }

  if (filter === 'all' || filter === 'fms') {
    (store.fms || []).forEach((entry) => {
      entry.steps.forEach((s, idx) => {
        if (!s.planned) return;
        total++;
        if (s.actual) completed++;
        else {
          pending++;
          items.push({
            id: entry.id + '-' + idx, type: 'FMS',
            description: FMS_STEPS[idx].name + ' — ' + entry.clientName,
            doer: entry.doer || '-', date: s.planned, client: entry.clientName,
            overdue: new Date(s.planned) < now, status: 'pending',
          });
        }
      });
    });
  }

  return {
    total, completed, pending, revised,
    pendingTasks: items.sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 50),
  };
}

export function computePerformance(store, fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  to.setHours(23, 59, 59);

  const stats = {};
  (store.users || []).forEach((u) => {
    stats[u.name] = { name: u.name, completed: 0, total: 0, pending: 0 };
  });

  (store.delegations || []).forEach((d) => {
    const date = new Date(d.createdAt);
    if (date >= from && date <= to && stats[d.doer]) {
      stats[d.doer].total++;
      if (d.status === 'done') stats[d.doer].completed++;
      else stats[d.doer].pending++;
    }
  });

  const arr = Object.values(stats).filter((s) => s.total > 0);
  arr.sort((a, b) => b.completed - a.completed);

  return {
    top5: arr.slice(0, 5),
    bottom5: [...arr].sort((a, b) => b.pending - a.pending).slice(0, 5),
    mostActive: [...arr].sort((a, b) => b.total - a.total).slice(0, 5),
  };
}

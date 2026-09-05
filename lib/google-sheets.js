import { getGoogleCredentials, getSheetsClient } from './googleCreds';

const SPREADSHEET_ID = '1uVHOQ8OSuah5JarpgR_2fkD7Mwdfu-6yWEMgJWfv9Nw';

const getSheets = getSheetsClient; // was un-memoized: a fresh JWT exchange per call

// Tab exists nahi to create karo aur header row likho
async function ensureTab(sheets, title, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets.some((s) => s.properties.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
  }
  // Always ensure header row is in A1
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });
}

// Full sync: header row rakho, data rows replace karo
async function syncTab(title, headers, rows) {
  const { client_email, private_key } = getGoogleCredentials();
  if (!client_email || !private_key) return;
  try {
    const sheets = getSheets();
    await ensureTab(sheets, title, headers);

    // Old data clear karo (header ke baad)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A2:Z10000`,
    });

    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${title}!A2`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
    }
  } catch (err) {
    console.error(`[Sheets] ${title} sync failed:`, err.message);
  }
}

// ── Per-table helpers ──────────────────────────────────────────────────────────

async function syncUsers(sql) {
  const rows = await sql`SELECT * FROM users ORDER BY id`;
  await syncTab(
    'Users',
    ['ID', 'Name', 'Email', 'Phone', 'Department', 'Roles', 'Active', 'Created At'],
    rows.map((u) => [
      u.id, u.name, u.email, u.phone || '', u.department || '',
      (Array.isArray(u.roles) ? u.roles : [u.roles]).filter(Boolean).join(', '),
      u.active ? 'Yes' : 'No',
      u.created_at ? new Date(u.created_at).toLocaleString('en-IN') : '',
    ])
  );
}

async function syncTasks(sql) {
  const [rows, users] = await Promise.all([
    sql`SELECT * FROM delegations ORDER BY id`,
    sql`SELECT id, name FROM users`,
  ]);
  const userMap = {};
  users.forEach((u) => { userMap[u.id] = u.name; });

  await syncTab(
    'Tasks',
    ['ID', 'Description', 'Doer', 'Delegated By', 'Client', 'Due Date', 'Priority', 'Status', 'Type', 'Remarks', 'Created At'],
    rows.map((t) => [
      t.id, t.description, t.doer || '',
      userMap[t.delegated_by] || t.delegated_by || '',  // ID ki jagah name
      t.client || '',
      t.due_date ? new Date(t.due_date).toLocaleDateString('en-IN') : '',
      t.priority || '', t.status || '', t.type || 'Delegation', t.remarks || '',
      t.created_at ? new Date(t.created_at).toLocaleString('en-IN') : '',
    ])
  );
}

async function syncChecklists(sql) {
  const rows = await sql`SELECT * FROM masters ORDER BY id`;
  await syncTab(
    'Checklists',
    ['ID', 'Task', 'Assigned To', 'Frequency', 'Created At'],
    rows.map((m) => [
      m.id, m.task || '', m.assigned_to || '', m.frequency || '',
      m.created_at ? new Date(m.created_at).toLocaleString('en-IN') : '',
    ])
  );
}

async function syncDailyTasks(sql) {
  let rows = [];
  try { rows = await sql`SELECT * FROM daily_tasks ORDER BY entry_date DESC, id`; } catch { return; }
  await syncTab(
    'Daily Tasks',
    ['ID', 'Date', 'Doer', 'Client', 'Department', 'Description', 'Minutes', 'Created At'],
    rows.map((d) => [
      d.id,
      d.entry_date ? new Date(d.entry_date).toLocaleDateString('en-IN') : '',
      d.doer || '', d.client || '', d.department || '', d.description || '',
      d.minutes || 0,
      d.created_at ? new Date(d.created_at).toLocaleString('en-IN') : '',
    ])
  );
}

async function syncLeaves(sql) {
  let rows = [];
  try { rows = await sql`SELECT * FROM leaves ORDER BY created_at DESC`; } catch { return; }
  await syncTab(
    'Leaves',
    ['ID', 'Employee', 'Type', 'From', 'To', 'Reason', 'Status', 'Approver', 'Applied At'],
    rows.map((l) => [
      l.id, l.user_name || '', l.type || '',
      l.from_date ? new Date(l.from_date).toLocaleDateString('en-IN') : '',
      l.to_date   ? new Date(l.to_date).toLocaleDateString('en-IN')   : '',
      l.reason || '', l.status || '', l.approver || '',
      l.created_at ? new Date(l.created_at).toLocaleString('en-IN') : '',
    ])
  );
}

async function syncClients(sql) {
  const rows = await sql`SELECT * FROM clients ORDER BY id`;
  await syncTab(
    'Clients',
    ['ID', 'Name', 'Contact Person', 'Contact Number', 'Email', 'Industry', 'Status', 'Notes', 'Created At'],
    rows.map((c) => [
      c.id, c.name, c.contact_person || '', c.contact_number || '',
      c.email || '', c.industry || '', c.status || '', c.notes || '',
      c.created_at ? new Date(c.created_at).toLocaleString('en-IN') : '',
    ])
  );
}

// Sabka ek saath sync (full sync button ke liye)
export async function syncAll(sql) {
  await Promise.allSettled([
    syncUsers(sql),
    syncTasks(sql),
    syncChecklists(sql),
    syncDailyTasks(sql),
    syncLeaves(sql),
    syncClients(sql),
  ]);
}

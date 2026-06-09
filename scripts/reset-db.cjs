// One-off: wipe ALL data rows from every tab and create a single admin user.
// Run: node scripts/reset-db.cjs
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SHEETS_DB_ID || '1fCitQ747zwub8r0svFjTjcX6_vujIo9yfqCU03PSg3c';

const TABS = [
  'users', 'delegations', 'masters', 'holidays', 'fms', 'fms_steps', 'profile',
  'app_config', 'checklist_completions', 'meetings', 'leaves', 'daily_tasks',
  'clients', 'dev_backups',
];

const USERS_HEADERS = ['id', 'name', 'email', 'phone', 'department', 'roles', 'active', 'password_hash', 'picture', 'force_logout_after', 'created_at'];

function nowDateTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

(async () => {
  const cred = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'credentials.json'), 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: cred.client_email, private_key: cred.private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // show current state before wiping
  const before = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'users!A1:K100' });
  console.log('BEFORE: users rows =', Math.max(0, (before.data.values || []).length - 1));

  // 1) clear every tab's data rows (keep header row 1)
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { ranges: TABS.map((t) => `${t}!A2:Z100000`) },
  });
  console.log('Cleared data from all tabs:', TABS.join(', '));

  // 2) create the single admin
  const hash = await bcrypt.hash('admin123', 10);
  const row = ['U001', 'Admin', 'admin@celestile.com', '', 'Administration', 'Admin', 1, hash, '', '', nowDateTime()];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'users!A2',
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
  console.log('Created admin: admin@celestile.com / admin123');

  // verify
  const after = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'users!A1:K100' });
  const rows = (after.data.values || []).slice(1).filter(r => r.some(c => c !== ''));
  console.log('AFTER: users rows =', rows.length);
  rows.forEach(r => console.log('  ->', r[0], '|', r[2], '| active=', r[6], '| hash?', r[7] ? 'yes' : 'NO'));
  console.log('Done. Database now has exactly one user.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

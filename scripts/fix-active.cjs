// One-off: normalise the users.active column to 1 for every user row.
// Fixes accounts that became unloginnable after `active` was stored as TRUE/NaN.
// Run: node scripts/fix-active.cjs
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SHEETS_DB_ID || '1fCitQ747zwub8r0svFjTjcX6_vujIo9yfqCU03PSg3c';
const ACTIVE_COL = 'G'; // users: id A, name B, email C, phone D, dept E, roles F, active G

(async () => {
  const cred = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'credentials.json'), 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: cred.client_email, private_key: cred.private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'users!A1:K1000' });
  const rows = r.data.values || [];
  const dataRows = rows.slice(1).filter((row) => row.some((c) => c !== ''));
  console.log('User rows:', dataRows.length);
  dataRows.forEach((row) => console.log('  before:', row[0], '| active=', JSON.stringify(row[6])));

  if (dataRows.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `users!${ACTIVE_COL}2:${ACTIVE_COL}${dataRows.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: dataRows.map(() => [1]) },
    });
  }
  console.log('Set active=1 for all users. Done.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

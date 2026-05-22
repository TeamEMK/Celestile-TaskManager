// Generates migration.sql (schema + INSERTs) from data/store.json.
// Run:  node scripts/gen-sql.mjs
// Then: open Adminer → SQL command → paste contents of migration.sql → Execute.
import fs from 'fs/promises';
import path from 'path';

const SCHEMA = `
DROP TABLE IF EXISTS fms_steps;
DROP TABLE IF EXISTS fms;
DROP TABLE IF EXISTS profile;
DROP TABLE IF EXISTS holidays;
DROP TABLE IF EXISTS masters;
DROP TABLE IF EXISTS delegations;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id          VARCHAR(16)  NOT NULL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  phone       VARCHAR(64)  DEFAULT '',
  department  VARCHAR(128) DEFAULT '',
  roles       VARCHAR(128) DEFAULT 'User',
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE delegations (
  id            VARCHAR(16)  NOT NULL PRIMARY KEY,
  description   TEXT         NOT NULL,
  doer_id       VARCHAR(16)  NULL,
  doer          VARCHAR(255) NOT NULL DEFAULT '',
  delegated_by  VARCHAR(16)  NULL,
  due_date      DATE         NULL,
  client        VARCHAR(255) DEFAULT '',
  status        ENUM('pending','done','revise') NOT NULL DEFAULT 'pending',
  type          VARCHAR(32)  NOT NULL DEFAULT 'delegation',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_del_doer (doer),
  INDEX idx_del_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE masters (
  id           VARCHAR(16)  NOT NULL PRIMARY KEY,
  task         TEXT         NOT NULL,
  assigned_to  VARCHAR(255) DEFAULT '',
  frequency    VARCHAR(32)  NOT NULL DEFAULT 'Daily',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE holidays (
  id     VARCHAR(16)  NOT NULL PRIMARY KEY,
  date   DATE         NOT NULL,
  name   VARCHAR(255) NOT NULL,
  type   VARCHAR(64)  DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE fms (
  id            VARCHAR(16)  NOT NULL PRIMARY KEY,
  client_name   VARCHAR(255) NOT NULL,
  platforms     TEXT         DEFAULT NULL,
  mobile        VARCHAR(64)  DEFAULT '',
  doer          VARCHAR(255) DEFAULT '',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE fms_steps (
  fms_id      VARCHAR(16) NOT NULL,
  step_index  INT         NOT NULL,
  planned     DATETIME    NULL,
  actual      DATETIME    NULL,
  PRIMARY KEY (fms_id, step_index),
  FOREIGN KEY (fms_id) REFERENCES fms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE profile (
  user_id             VARCHAR(16)  NOT NULL PRIMARY KEY,
  notification_email  VARCHAR(255) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function toDate(s) {
  if (!s) return null;
  if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

function toDateTime(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function buildInserts(table, columns, rows) {
  if (!rows.length) return `-- ${table}: 0 rows\n`;
  const cols = columns.join(',');
  const values = rows.map((r) => '(' + r.map(esc).join(',') + ')').join(',\n  ');
  return `-- ${table}: ${rows.length} rows\nINSERT INTO ${table} (${cols}) VALUES\n  ${values};\n`;
}

async function main() {
  const file = path.join(process.cwd(), 'data', 'store.json');
  const raw = await fs.readFile(file, 'utf8');
  const data = JSON.parse(raw);

  const out = [];
  out.push('-- ===== Indian Automotive ERP — initial schema + data =====');
  out.push(`-- Generated: ${new Date().toISOString()}`);
  out.push('SET NAMES utf8mb4;');
  out.push('SET FOREIGN_KEY_CHECKS=0;');
  out.push(SCHEMA);
  out.push('SET FOREIGN_KEY_CHECKS=1;');
  out.push('');

  // users
  const userRows = (data.users || []).map((u) => [
    u.id, u.name, u.email, u.phone || '', u.department || '',
    (u.roles && u.roles.length ? u.roles : ['User']).join(','),
    u.active === false ? 0 : 1,
    toDateTime(u.createdAt) || toDateTime(new Date().toISOString()),
  ]);
  out.push(buildInserts('users',
    ['id','name','email','phone','department','roles','active','created_at'], userRows));

  // delegations
  const delRows = (data.delegations || []).map((d) => [
    d.id, d.description, d.doerId || null, d.doer || '',
    d.delegatedBy || null, toDate(d.dueDate), d.client || '',
    d.status || 'pending', d.type || 'delegation',
    toDateTime(d.createdAt) || toDateTime(new Date().toISOString()),
  ]);
  out.push(buildInserts('delegations',
    ['id','description','doer_id','doer','delegated_by','due_date','client','status','type','created_at'], delRows));

  // masters
  const masterRows = (data.masters || []).map((m) => [
    m.id, m.task, m.assignedTo || '', m.frequency || 'Daily',
    toDateTime(m.createdAt) || toDateTime(new Date().toISOString()),
  ]);
  out.push(buildInserts('masters', ['id','task','assigned_to','frequency','created_at'], masterRows));

  // holidays
  const holRows = (data.holidays || []).map((h) => [h.id, toDate(h.date), h.name, h.type || '']);
  out.push(buildInserts('holidays', ['id','date','name','type'], holRows));

  // fms + fms_steps
  const fmsRows = (data.fms || []).map((f) => [
    f.id, f.clientName, f.platforms || '', f.mobile || '', f.doer || '',
    toDateTime(f.createdAt) || toDateTime(new Date().toISOString()),
  ]);
  out.push(buildInserts('fms',
    ['id','client_name','platforms','mobile','doer','created_at'], fmsRows));

  const stepRows = [];
  for (const f of data.fms || []) {
    (f.steps || []).forEach((s, i) => {
      stepRows.push([f.id, i, toDateTime(s.planned), toDateTime(s.actual)]);
    });
  }
  out.push(buildInserts('fms_steps', ['fms_id','step_index','planned','actual'], stepRows));

  // profile
  if (data.profile?.userId) {
    out.push(`INSERT INTO profile (user_id, notification_email) VALUES (${esc(data.profile.userId)}, ${esc(data.profile.notificationEmail || '')});`);
  }

  const sql = out.join('\n');
  const outFile = path.join(process.cwd(), 'migration.sql');
  await fs.writeFile(outFile, sql);
  console.log(`✅ Wrote ${outFile} (${(sql.length / 1024).toFixed(1)} KB)`);
  console.log(`   users:       ${userRows.length}`);
  console.log(`   delegations: ${delRows.length}`);
  console.log(`   masters:     ${masterRows.length}`);
  console.log(`   holidays:    ${holRows.length}`);
  console.log(`   fms:         ${fmsRows.length} (${stepRows.length} steps)`);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });

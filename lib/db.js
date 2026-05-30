import mysql from 'mysql2/promise';

const globalForPool = globalThis;

if (!globalForPool.__mysql_pool) {
  globalForPool.__mysql_pool = process.env.DB_HOST
    ? mysql.createPool({
        host:     process.env.DB_HOST,
        port:     Number(process.env.DB_PORT || 3306),
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        namedPlaceholders: true,
        dateStrings: true,
      })
    : null;
  globalForPool.__schema_ready = null;
}

const _noopPool = { query: () => Promise.resolve([[]]) };
export const pool = globalForPool.__mysql_pool ?? _noopPool;

export async function q(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// ---- Schema bootstrap (idempotent) ----
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id            VARCHAR(16)  NOT NULL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    phone         VARCHAR(64)  DEFAULT '',
    department    VARCHAR(128) DEFAULT '',
    roles         VARCHAR(128) DEFAULT 'User',
    active        TINYINT(1)   NOT NULL DEFAULT 1,
    password_hash VARCHAR(255) DEFAULT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS delegations (
    id            VARCHAR(16)  NOT NULL PRIMARY KEY,
    description   TEXT         NOT NULL,
    doer_id       VARCHAR(16)  NULL,
    doer          VARCHAR(255) NOT NULL DEFAULT '',
    delegated_by  VARCHAR(16)  NULL,
    due_date      DATE         NULL,
    client        VARCHAR(255) DEFAULT '',
    status        ENUM('pending','done','revise','revise_requested','approval_pending') NOT NULL DEFAULT 'pending',
    type          VARCHAR(32)  NOT NULL DEFAULT 'delegation',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_del_doer (doer),
    INDEX idx_del_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS masters (
    id           VARCHAR(16)  NOT NULL PRIMARY KEY,
    task         TEXT         NOT NULL,
    assigned_to  VARCHAR(255) DEFAULT '',
    frequency    VARCHAR(32)  NOT NULL DEFAULT 'Daily',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS holidays (
    id     VARCHAR(16)  NOT NULL PRIMARY KEY,
    date   DATE         NOT NULL,
    name   VARCHAR(255) NOT NULL,
    type   VARCHAR(64)  DEFAULT ''
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS fms (
    id            VARCHAR(16)  NOT NULL PRIMARY KEY,
    client_name   VARCHAR(255) NOT NULL,
    platforms     TEXT         DEFAULT NULL,
    mobile        VARCHAR(64)  DEFAULT '',
    doer          VARCHAR(255) DEFAULT '',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS fms_steps (
    fms_id      VARCHAR(16) NOT NULL,
    step_index  INT         NOT NULL,
    planned     DATETIME    NULL,
    actual      DATETIME    NULL,
    PRIMARY KEY (fms_id, step_index),
    FOREIGN KEY (fms_id) REFERENCES fms(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS profile (
    user_id             VARCHAR(16)  NOT NULL PRIMARY KEY,
    notification_email  VARCHAR(255) DEFAULT ''
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

const EXTRA_TABLES = [
  `CREATE TABLE IF NOT EXISTS app_config (
    \`key\`   VARCHAR(64)  NOT NULL PRIMARY KEY,
    \`value\` TEXT         NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS checklist_completions (
    id           VARCHAR(16)  NOT NULL PRIMARY KEY,
    master_id    VARCHAR(16)  NOT NULL,
    doer         VARCHAR(255) DEFAULT '',
    completed_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    date         DATE         NOT NULL,
    INDEX idx_cc_master (master_id),
    INDEX idx_cc_date   (date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS meetings (
    id           VARCHAR(16)  NOT NULL PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    meeting_date DATE         NOT NULL,
    start_time   VARCHAR(10)  DEFAULT NULL,
    end_time     VARCHAR(10)  DEFAULT NULL,
    attendees    TEXT         DEFAULT NULL,
    notes        TEXT         DEFAULT NULL,
    created_by   VARCHAR(255) DEFAULT '',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mtg_date (meeting_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS leaves (
    id         VARCHAR(16)  NOT NULL PRIMARY KEY,
    user_id    VARCHAR(16)  NULL,
    user_name  VARCHAR(255) NOT NULL,
    type       VARCHAR(64)  DEFAULT 'Leave',
    from_date  DATE         NOT NULL,
    to_date    DATE         NOT NULL,
    reason     TEXT         DEFAULT NULL,
    status     VARCHAR(32)  DEFAULT 'pending',
    approver   VARCHAR(255) DEFAULT 'HOD',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME     NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS daily_tasks (
    id         VARCHAR(16)  NOT NULL PRIMARY KEY,
    entry_date DATE         NOT NULL,
    doer_id    VARCHAR(16)  NULL,
    doer       VARCHAR(255) NOT NULL DEFAULT '',
    client     VARCHAR(255) DEFAULT '',
    department VARCHAR(128) DEFAULT '',
    description TEXT        DEFAULT NULL,
    minutes    INT          DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dt_doer (doer_id),
    INDEX idx_dt_date (entry_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS clients (
    id             VARCHAR(16)  NOT NULL PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255) DEFAULT '',
    contact_number VARCHAR(64)  DEFAULT '',
    email          VARCHAR(255) DEFAULT '',
    industry       VARCHAR(128) DEFAULT '',
    status         VARCHAR(32)  DEFAULT 'active',
    notes          TEXT         DEFAULT NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

const ALTER_STMTS = [
  `ALTER TABLE users      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT NULL`,
  `ALTER TABLE users      ADD COLUMN IF NOT EXISTS picture MEDIUMTEXT DEFAULT NULL`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS priority     VARCHAR(32)  DEFAULT 'Low'`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS approval     VARCHAR(64)  DEFAULT 'No Approval'`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS url          VARCHAR(500) DEFAULT ''`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS remarks      TEXT`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS completed_at DATETIME     DEFAULT NULL`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS revise_action VARCHAR(32) DEFAULT NULL`,
  `ALTER TABLE delegations MODIFY COLUMN status ENUM('pending','done','revise','revise_requested','approval_pending') NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS transferred_by   VARCHAR(255) DEFAULT NULL`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS transferred_from VARCHAR(255) DEFAULT NULL`,
];

export async function ensureSchema() {
  if (!pool) return;
  if (globalForPool.__schema_ready) return globalForPool.__schema_ready;
  globalForPool.__schema_ready = (async () => {
    for (const stmt of SCHEMA)        await pool.query(stmt);
    for (const stmt of EXTRA_TABLES)  await pool.query(stmt);
    for (const stmt of ALTER_STMTS)   await pool.query(stmt).catch(() => {});
  })();
  return globalForPool.__schema_ready;
}

// Date helpers — MySQL DATE / DATETIME come back as strings (dateStrings:true)
export function toMysqlDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
export function toMysqlDate(s) {
  if (!s) return null;
  if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
}
export function fromMysqlDateTime(s) {
  if (!s) return null;
  // s like "2026-04-08 12:00:00" — treat as UTC for ISO output
  return s.replace(' ', 'T') + 'Z';
}
export function fromMysqlDate(s) {
  if (!s) return null;
  return s.length > 10 ? s.slice(0, 10) : s;
}

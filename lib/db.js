import mysql from 'mysql2/promise';
import * as sheets from './sheets-client.js';
import { query as sheetsQuery, makeConnection as sheetsConnection } from './sql-sheets.js';

// Google Sheets is the database when SHEETS_DB_ID + Google creds are present.
// Otherwise fall back to MySQL (DB_HOST) exactly as before.
export const USE_SHEETS = sheets.isSheetsConfigured();

// The app's routes decide "is a real DB configured?" by checking
// `process.env.DB_HOST` (the `hasDB` / `hasMySQL` flags scattered across
// ~13 files). In Sheets mode we want them ALL to take the DB path (direct
// SQL, which our sheets engine implements) instead of the JSON-file path —
// that keeps behaviour consistent and avoids writeStore() wiping columns.
// Since lib/db.js is imported before any route body runs, setting a sentinel
// here makes every `!!process.env.DB_HOST` check read true. The real MySQL
// pool is still NOT created (it's gated on `!USE_SHEETS` below).
if (USE_SHEETS && !process.env.DB_HOST) process.env.DB_HOST = 'sheets';

const globalForPool = globalThis;

// Trim stray whitespace/newlines that .env imports sometimes add, and force
// IPv4 for "localhost" — many managed MySQL users (e.g. Hostinger) are granted
// for 127.0.0.1/localhost but NOT the IPv6 "::1" that Node may otherwise use.
const envc = (v) => String(v ?? '').trim();
const DB_HOST_RAW = envc(process.env.DB_HOST);
const DB_HOST = DB_HOST_RAW.toLowerCase() === 'localhost' ? '127.0.0.1' : DB_HOST_RAW;

if (!globalForPool.__mysql_pool) {
  globalForPool.__mysql_pool = (!USE_SHEETS && DB_HOST)
    ? mysql.createPool({
        host:     DB_HOST,
        port:     Number(envc(process.env.DB_PORT) || 3306),
        user:     envc(process.env.DB_USER),
        password: envc(process.env.DB_PASSWORD),
        database: envc(process.env.DB_NAME),
        waitForConnections: true,
        connectionLimit: 8,
        queueLimit: 0,
        namedPlaceholders: true,
        dateStrings: true,
        // Shared hosts (e.g. Hostinger) drop idle MySQL connections; keep them
        // warm and recycle them so we don't query a dead socket.
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        idleTimeout: 60000,
      })
    : null;

  // CRITICAL: without an 'error' listener, a dropped idle connection makes
  // mysql2 emit an unhandled 'error' event → Node process crashes (503 loop).
  if (globalForPool.__mysql_pool) {
    globalForPool.__mysql_pool.on('error', (e) => {
      console.error('[mysql pool error]', e && e.code, e && e.message);
    });
  }
  globalForPool.__schema_ready = null;
}

// Also stop the whole process from dying on any stray async error/rejection
// (a single bad request should never take the server down on shared hosting).
if (!globalThis.__procGuards) {
  globalThis.__procGuards = true;
  process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r));
  process.on('uncaughtException', (e) => console.error('[uncaughtException]', e && e.message));
}

const _noopPool = { query: () => Promise.resolve([[]]) };

// Sheets-backed pool exposing the same surface the app uses (query + getConnection).
const _sheetsPool = {
  query: (sql, params) => sheetsQuery(sql, params),
  getConnection: async () => sheetsConnection(),
};

export const pool = USE_SHEETS
  ? _sheetsPool
  : (globalForPool.__mysql_pool ?? _noopPool);

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
    start_date   DATE         DEFAULT NULL,
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
    id           VARCHAR(16)  NOT NULL PRIMARY KEY,
    entry_date   DATE         NOT NULL,
    doer_id      VARCHAR(16)  NULL,
    doer         VARCHAR(255) NOT NULL DEFAULT '',
    client       VARCHAR(255) DEFAULT '',
    department   VARCHAR(128) DEFAULT '',
    description  TEXT         DEFAULT NULL,
    minutes      INT          DEFAULT 0,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    order_number VARCHAR(255) DEFAULT '',
    area_name    VARCHAR(255) DEFAULT '',
    task_type    VARCHAR(255) DEFAULT '',
    software     VARCHAR(255) DEFAULT '',
    revision     VARCHAR(8)   DEFAULT 'No',
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

  `CREATE TABLE IF NOT EXISTS quotations (
    id                   VARCHAR(24)  NOT NULL PRIMARY KEY,
    ref_no               VARCHAR(64)  NOT NULL DEFAULT '',
    branch               VARCHAR(32)  NOT NULL DEFAULT 'bangalore',
    client_name          VARCHAR(255) DEFAULT '',
    client_firm          VARCHAR(255) DEFAULT '',
    client_contact       VARCHAR(64)  DEFAULT '',
    client_email         VARCHAR(255) DEFAULT '',
    pan                  VARCHAR(32)  DEFAULT '',
    architect_name       VARCHAR(255) DEFAULT '',
    architect_firm       VARCHAR(255) DEFAULT '',
    architect            VARCHAR(255) DEFAULT '',
    consultant           VARCHAR(255) DEFAULT '',
    consultant_number    VARCHAR(64)  DEFAULT '',
    consultant_email     VARCHAR(255) DEFAULT '',
    boutique             VARCHAR(255) DEFAULT '',
    payment_terms        VARCHAR(255) DEFAULT '',
    validity             VARCHAR(64)  DEFAULT '',
    lead_time            VARCHAR(64)  DEFAULT '',
    transport            VARCHAR(255) DEFAULT '',
    billing_address      TEXT         DEFAULT NULL,
    site_address         TEXT         DEFAULT NULL,
    grand_total          VARCHAR(64)  DEFAULT '',
    discount_pct         VARCHAR(32)  DEFAULT '',
    design_fees          VARCHAR(64)  DEFAULT '',
    installation_charges VARCHAR(64)  DEFAULT '',
    packing_charges      VARCHAR(64)  DEFAULT '',
    stone_items          MEDIUMTEXT   DEFAULT NULL,
    totals_config        MEDIUMTEXT   DEFAULT NULL,
    fixing_items         MEDIUMTEXT   DEFAULT NULL,
    pdf                  VARCHAR(500) DEFAULT '',
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_quo_branch (branch),
    INDEX idx_quo_ref (ref_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS consultants (
    name   VARCHAR(255) NOT NULL PRIMARY KEY,
    mobile VARCHAR(64)  DEFAULT '',
    email  VARCHAR(255) DEFAULT ''
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS inventory (
    id              VARCHAR(24)  NOT NULL PRIMARY KEY,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    inv_key         VARCHAR(64)  DEFAULT '',
    slab            VARCHAR(128) DEFAULT '',
    block           VARCHAR(64)  DEFAULT '-',
    material        VARCHAR(255) DEFAULT '',
    thickness       VARCHAR(64)  DEFAULT '',
    size_l          VARCHAR(32)  DEFAULT '',
    size_w          VARCHAR(32)  DEFAULT '',
    sft             VARCHAR(32)  DEFAULT '',
    slab_photo      MEDIUMTEXT   DEFAULT NULL,
    status          VARCHAR(32)  DEFAULT 'Available',
    updated_at      DATETIME     NULL,
    order_no        VARCHAR(128) DEFAULT '',
    client          VARCHAR(255) DEFAULT '',
    area            VARCHAR(255) DEFAULT '',
    cutting         VARCHAR(16)  DEFAULT '',
    cutting_reason  VARCHAR(255) DEFAULT '',
    cutting_size_l  VARCHAR(32)  DEFAULT '',
    cutting_size_w  VARCHAR(32)  DEFAULT '',
    remarks         TEXT         DEFAULT NULL,
    INDEX idx_inv_status (status),
    INDEX idx_inv_order (order_no),
    INDEX idx_inv_material (material)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS stone_master (
    id        VARCHAR(24)  NOT NULL PRIMARY KEY,
    material  VARCHAR(255) NOT NULL,
    thickness VARCHAR(64)  DEFAULT ''
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS fsm_step2 (
    id               VARCHAR(24)  NOT NULL PRIMARY KEY,
    inv_key          VARCHAR(64)  DEFAULT '',
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    order_no         VARCHAR(128) DEFAULT '',
    material         VARCHAR(255) DEFAULT '',
    all_pieces       VARCHAR(64)  DEFAULT '',
    grain            VARCHAR(64)  DEFAULT '',
    grain_img        MEDIUMTEXT   DEFAULT NULL,
    issue            TEXT         DEFAULT NULL,
    cutting_required VARCHAR(16)  DEFAULT 'No',
    mat_img          MEDIUMTEXT   DEFAULT NULL,
    sizes_packing    TEXT         DEFAULT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS dev_backups (
    id         VARCHAR(24)  NOT NULL PRIMARY KEY,
    label      VARCHAR(255) DEFAULT '',
    data       LONGTEXT     DEFAULT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME     NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS fms_flows (
    id          VARCHAR(50)  NOT NULL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    coordinator VARCHAR(100) DEFAULT '',
    steps       TEXT         DEFAULT NULL,
    sheet_url   VARCHAR(500) DEFAULT '',
    color       VARCHAR(20)  DEFAULT '#2563eb',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS fms_flow_entries (
    id           VARCHAR(60)  NOT NULL PRIMARY KEY,
    flow_id      VARCHAR(50)  NOT NULL,
    skm_no       VARCHAR(50)  DEFAULT '',
    order_no     VARCHAR(100) DEFAULT '',
    client_name  VARCHAR(200) DEFAULT '',
    area         VARCHAR(200) DEFAULT '',
    technology   VARCHAR(100) DEFAULT '',
    sft          VARCHAR(20)  DEFAULT '',
    lead_date    DATE         DEFAULT NULL,
    planned_date DATE         DEFAULT NULL,
    doer_name    VARCHAR(100) DEFAULT '',
    doer_email   VARCHAR(200) DEFAULT '',
    status       VARCHAR(20)  DEFAULT 'active',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ffe_flow (flow_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS fms_flow_steps (
    entry_id     VARCHAR(60)  NOT NULL,
    step_index   INT          NOT NULL,
    completed_at DATETIME     DEFAULT NULL,
    completed_by VARCHAR(100) DEFAULT '',
    PRIMARY KEY (entry_id, step_index)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

const ALTER_STMTS = [
  `ALTER TABLE users      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT NULL`,
  `ALTER TABLE users      ADD COLUMN IF NOT EXISTS picture MEDIUMTEXT DEFAULT NULL`,
  `ALTER TABLE users      ADD COLUMN IF NOT EXISTS access TEXT DEFAULT NULL`,
  `ALTER TABLE users      ADD COLUMN IF NOT EXISTS force_logout_after DATETIME DEFAULT NULL`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS priority     VARCHAR(32)  DEFAULT 'Low'`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS approval     VARCHAR(64)  DEFAULT 'No Approval'`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS url          VARCHAR(500) DEFAULT ''`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS remarks      TEXT`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS completed_at DATETIME     DEFAULT NULL`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS revise_action VARCHAR(32) DEFAULT NULL`,
  `ALTER TABLE delegations MODIFY COLUMN status ENUM('pending','done','revise','revise_requested','approval_pending') NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS transferred_by   VARCHAR(255) DEFAULT NULL`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS transferred_from VARCHAR(255) DEFAULT NULL`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS image            MEDIUMTEXT   DEFAULT NULL`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS require_file     TINYINT(1)   DEFAULT 0`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS attachment       MEDIUMTEXT   DEFAULT NULL`,
  `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS completion_file  MEDIUMTEXT   DEFAULT NULL`,
  `ALTER TABLE masters     ADD COLUMN IF NOT EXISTS require_file     TINYINT(1)   DEFAULT 0`,
  `ALTER TABLE masters     ADD COLUMN IF NOT EXISTS attachment       MEDIUMTEXT   DEFAULT NULL`,
  `ALTER TABLE checklist_completions ADD COLUMN IF NOT EXISTS file   MEDIUMTEXT   DEFAULT NULL`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS order_number     VARCHAR(255) DEFAULT ''`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS area_name        VARCHAR(255) DEFAULT ''`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS task_type        VARCHAR(255) DEFAULT ''`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS software         VARCHAR(255) DEFAULT ''`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS revision         VARCHAR(8)   DEFAULT 'No'`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS site_location    VARCHAR(255) DEFAULT ''`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS purpose_of_visit VARCHAR(255) DEFAULT ''`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS checks_type      VARCHAR(255) DEFAULT ''`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS kms_travelled    DECIMAL(8,2) DEFAULT 0`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS client_number       VARCHAR(50)  DEFAULT ''`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS branch              VARCHAR(50)  DEFAULT 'Bangalore'`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS pre_install_image   LONGTEXT     DEFAULT NULL`,
  `ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS pre_install_comment TEXT         DEFAULT NULL`,
  `ALTER TABLE quotations  ADD COLUMN IF NOT EXISTS status              VARCHAR(20)  DEFAULT 'pending'`,
  `ALTER TABLE quotations  ADD COLUMN IF NOT EXISTS created_by_id       VARCHAR(16)  DEFAULT NULL`,
  `ALTER TABLE quotations  ADD COLUMN IF NOT EXISTS created_by_name     VARCHAR(255) DEFAULT ''`,
  `ALTER TABLE quotations  ADD COLUMN IF NOT EXISTS approval_token      VARCHAR(64)  DEFAULT NULL`,
  `ALTER TABLE quotations  ADD COLUMN IF NOT EXISTS approved_by         VARCHAR(255) DEFAULT NULL`,
  `ALTER TABLE quotations  ADD COLUMN IF NOT EXISTS approved_at         DATETIME     DEFAULT NULL`,
];

export async function ensureSchema() {
  if (USE_SHEETS) return sheets.ensureTabs();
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

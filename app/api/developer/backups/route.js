import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireDeveloper } from '@/lib/api';

async function ensureBackupTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dev_backups (
      id         VARCHAR(64)   NOT NULL PRIMARY KEY,
      label      VARCHAR(128)  NOT NULL DEFAULT '',
      data       LONGTEXT      NOT NULL,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME      NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function createBackup(label = 'auto') {
  await ensureBackupTable();
  const [dels]   = await pool.query('SELECT * FROM delegations');
  const [masters] = await pool.query('SELECT * FROM masters');
  const [users]  = await pool.query('SELECT * FROM users');
  const [hols]   = await pool.query('SELECT * FROM holidays').catch(() => [[]]);

  const data = JSON.stringify({ delegations: dels, masters, users, holidays: hols });
  const id   = 'BKP_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6).toUpperCase();

  await pool.query(
    'INSERT INTO dev_backups (id, label, data, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 DAY))',
    [id, label, data]
  );
  return id;
}

// GET — list backups within 15 days
export async function GET(req) {
  const gate = requireDeveloper(req); if (gate) return gate;
  try {
    await ensureBackupTable();
    await pool.query('DELETE FROM dev_backups WHERE expires_at < NOW()');
    const [rows] = await pool.query(
      'SELECT id, label, created_at, expires_at FROM dev_backups ORDER BY created_at DESC LIMIT 30'
    );
    return NextResponse.json({ backups: rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

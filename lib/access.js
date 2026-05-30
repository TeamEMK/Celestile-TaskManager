import { pool } from './db.js';

export async function isAccessEnabled() {
  if (!process.env.DB_HOST) return true;
  try {
    const [rows] = await pool.query(
      "SELECT `value` FROM app_config WHERE `key` = 'access_enabled'"
    );
    if (!rows.length) return true;
    return rows[0].value !== 'false';
  } catch {
    return true;
  }
}

export async function setAccessEnabled(enabled) {
  await pool.query(
    "INSERT INTO app_config (`key`, `value`) VALUES ('access_enabled', ?) ON DUPLICATE KEY UPDATE `value` = ?",
    [String(enabled), String(enabled)]
  );
}

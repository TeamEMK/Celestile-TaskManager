import { pool } from './db.js';

// "Service Suspended" kill switch (app_config.access_enabled), flipped from
// the /developer panel. It gates the whole product, so it is read on every
// page render AND — since a suspended app must not keep serving data through
// its API — on every guarded API call too. That is far too hot for a DB round
// trip each time, hence the short TTL: a flip lands within CACHE_MS.
const CACHE_MS = 5000;
let _cache = null; // { value, at }

export function invalidateAccessCache() {
  _cache = null;
}

export async function isAccessEnabled() {
  if (!process.env.DB_HOST) return true;
  if (_cache && Date.now() - _cache.at < CACHE_MS) return _cache.value;
  let value = true;
  try {
    const [rows] = await pool.query(
      "SELECT `value` FROM app_config WHERE `key` = 'access_enabled'"
    );
    value = !rows.length || rows[0].value !== 'false';
  } catch {
    // Fail open: a DB blip must not lock everyone out of the product.
    value = true;
  }
  _cache = { value, at: Date.now() };
  return value;
}

export async function setAccessEnabled(enabled) {
  await pool.query(
    "INSERT INTO app_config (`key`, `value`) VALUES ('access_enabled', ?) ON DUPLICATE KEY UPDATE `value` = ?",
    [String(enabled), String(enabled)]
  );
  invalidateAccessCache();
}

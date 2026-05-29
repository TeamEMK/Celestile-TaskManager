import { pool } from './db.js';

// Tagged-template SQL adapter for MySQL pool.
// Usage: await sql`SELECT * FROM users WHERE id = ${id}`
export async function sql(strings, ...values) {
  let query = '';
  const params = [];
  strings.forEach((str, i) => {
    query += str;
    if (i < values.length) {
      const v = values[i];
      if (Array.isArray(v)) {
        query += '?';
        params.push(v.join(','));
      } else {
        query += '?';
        params.push(v ?? null);
      }
    }
  });
  const [rows] = await pool.query(query, params);
  return rows;
}

// Helper: COUNT(*) AS cnt → number
export async function count(table) {
  const [rows] = await pool.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
  return Number(rows[0].cnt);
}

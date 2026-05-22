import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: '.env.local' });

const cfg = {
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectTimeout: 10000,
};

console.log(`→ Connecting to ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} …`);
const t0 = Date.now();
try {
  const conn = await mysql.createConnection(cfg);
  const [rows] = await conn.query('SELECT VERSION() AS v, NOW() AS ts');
  console.log(`✅ Connected in ${Date.now() - t0} ms`);
  console.log('   Server:', rows[0].v, '|  Server time:', rows[0].ts);

  const [tbls] = await conn.query("SHOW TABLES");
  console.log(`   Tables: ${tbls.length} →`, tbls.map((r) => Object.values(r)[0]).join(', '));

  const [u] = await conn.query('SELECT COUNT(*) c FROM users');
  console.log(`   Users in DB: ${u[0].c}`);

  await conn.end();
} catch (e) {
  console.log(`❌ FAILED in ${Date.now() - t0} ms`);
  console.log('   Error code :', e.code);
  console.log('   Error errno:', e.errno);
  console.log('   Message    :', e.message);
  process.exit(1);
}

import mysql from 'mysql2/promise';

const cfg = {
  host: '87.106.200.69',
  port: 5433,
  user: 'india_auto_user',
  password: 'StrongPass123!',
  database: 'india_automotive',
  connectTimeout: 10000,
};

console.log(`→ Trying MySQL protocol on ${cfg.host}:${cfg.port} ...`);
const t0 = Date.now();
try {
  const conn = await mysql.createConnection(cfg);
  const [r] = await conn.query('SELECT VERSION() AS v, NOW() AS ts');
  console.log(`✅ MySQL Connected in ${Date.now() - t0} ms`);
  console.log('   Server:', r[0].v, '| Time:', r[0].ts);
  const [t] = await conn.query('SHOW TABLES');
  console.log(`   Tables: ${t.length} →`, t.map((r) => Object.values(r)[0]).join(', '));
  const [u] = await conn.query('SELECT COUNT(*) c FROM users');
  console.log(`   Users: ${u[0].c}`);
  await conn.end();
} catch (e) {
  console.log(`❌ FAILED in ${Date.now() - t0} ms`);
  console.log('   Code:', e.code);
  console.log('   Msg :', e.message);
}

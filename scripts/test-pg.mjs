import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });

const host = process.env.DB_HOST;
const port = Number(process.env.DB_PORT || 5432);
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_NAME;

console.log(`→ Connecting to postgres ${user}@${host}:${port}/${database} ...`);

// Try without SSL first, then with SSL if it fails
async function tryConnect(useSSL) {
  const client = new pg.Client({
    host, port, user, password, database,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  const r = await client.query('SELECT version() AS v, NOW() AS ts');
  console.log(`✅ Connected (ssl=${useSSL})`);
  console.log('   Server :', r.rows[0].v.split(',')[0]);
  console.log('   Time   :', r.rows[0].ts);
  const t = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
  console.log(`   Tables (${t.rows.length}):`, t.rows.map((x) => x.tablename).join(', ') || '(none)');
  await client.end();
}

try {
  await tryConnect(false);
} catch (e1) {
  console.log(`   ✗ Without SSL: ${e1.code || ''} ${e1.message}`);
  try {
    await tryConnect(true);
  } catch (e2) {
    console.log(`   ✗ With SSL: ${e2.code || ''} ${e2.message}`);
    process.exit(1);
  }
}

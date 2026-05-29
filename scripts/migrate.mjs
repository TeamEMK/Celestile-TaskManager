// One-shot migration: reads data/store.json and uploads it to MySQL.
// Usage:  node scripts/migrate.mjs
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

// Load env BEFORE importing db.js (which reads process.env at module init)
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const { pool, ensureSchema } = await import('../lib/db.js');
const { writeStore, readStore } = await import('../lib/store.js');

async function main() {
  console.log(`→ DB target: ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT || 5433}/${process.env.DB_NAME}`);

  const file = path.join(process.cwd(), 'data', 'store.json');
  let data;
  try {
    const raw = await fs.readFile(file, 'utf8');
    data = JSON.parse(raw);
    console.log(`✓ Loaded data/store.json (${(raw.length / 1024).toFixed(1)} KB)`);
  } catch {
    console.log('ℹ No data/store.json — initializing empty DB.');
    data = { users: [], delegations: [], masters: [], holidays: [], fms: [], profile: {} };
  }

  console.log('→ Ensuring schema…');
  await ensureSchema();

  console.log('→ Writing data to MySQL…');
  await writeStore(data);

  console.log('→ Verifying readback…');
  const after = await readStore();
  console.log('  users:       ', after.users.length);
  console.log('  delegations: ', after.delegations.length);
  console.log('  masters:     ', after.masters.length);
  console.log('  holidays:    ', after.holidays.length);
  console.log('  fms entries: ', after.fms.length);

  await pool.end();
  console.log('✅ Migration complete');
}

main().catch(async (err) => {
  console.error('❌ Migration failed:', err.message);
  console.error(err);
  try { await pool.end(); } catch {}
  process.exit(1);
});

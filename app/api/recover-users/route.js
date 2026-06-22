import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

// One-time recovery: reads the old JSON store and re-inserts users into MySQL.
export async function GET() {
  try {
    // Try common JSON store file locations
    const candidates = [
      path.join(process.cwd(), 'data', 'store.json'),
      path.join(process.cwd(), 'data.json'),
      path.join(process.cwd(), 'store.json'),
      path.join(process.cwd(), 'data', 'db.json'),
    ];

    let storeData = null;
    let foundPath = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try { storeData = JSON.parse(fs.readFileSync(p, 'utf8')); foundPath = p; break; }
        catch {}
      }
    }

    if (!storeData) {
      return NextResponse.json({
        found: false,
        message: 'No JSON store file found. Users were only in MySQL.',
        checked: candidates,
      });
    }

    const users = storeData.users || [];
    if (!users.length) {
      return NextResponse.json({ found: true, path: foundPath, message: 'JSON store found but no users in it.', storeKeys: Object.keys(storeData) });
    }

    const { pool, ensureSchema } = await import('@/lib/db');
    await ensureSchema();

    let inserted = 0, skipped = 0;
    const errors = [];

    for (const u of users) {
      if (!u.email || !u.name) { skipped++; continue; }
      try {
        const [ex] = await pool.query('SELECT id FROM users WHERE email = ?', [u.email.toLowerCase()]);
        if (ex.length) { skipped++; continue; }

        const id = u.id || ('U' + Math.floor(Math.random() * 9000 + 1000));
        const roles = Array.isArray(u.roles) ? u.roles.join(',') : (u.roles || 'User');
        const hash = u.password_hash || (u.password ? await bcrypt.hash(u.password, 10) : null);

        await pool.query(
          `INSERT INTO users (id, name, email, phone, department, roles, active, password_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW())`,
          [id, u.name, u.email.toLowerCase(), u.phone || '', u.department || '', roles, hash]
        );
        inserted++;
      } catch (e) {
        errors.push(`${u.email}: ${e.message}`);
      }
    }

    const [final] = await pool.query('SELECT id, name, email, department, roles FROM users ORDER BY id');
    return NextResponse.json({
      found: true,
      path: foundPath,
      totalInFile: users.length,
      inserted,
      skipped,
      errors,
      usersNowInDB: final,
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

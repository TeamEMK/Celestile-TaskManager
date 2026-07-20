import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';

const CONFIG_KEY = 'custom_departments';

async function readList() {
  const [rows] = await pool.query("SELECT `value` FROM app_config WHERE `key` = ?", [CONFIG_KEY]);
  if (!rows.length) return [];
  try { const list = JSON.parse(rows[0].value); return Array.isArray(list) ? list : []; }
  catch { return []; }
}

// Custom departments added from the Add/Edit User form — stored alongside
// the hardcoded DEPARTMENTS list in UsersClient.jsx, in the generic
// app_config key/value table (same pattern as the app_active/access_enabled flags).
export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    return NextResponse.json(await readList());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const { name } = await req.json();
    const trimmed = (name || '').trim();
    if (!trimmed) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const list = await readList();
    if (!list.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      list.push(trimmed);
      await pool.query(
        "INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?",
        [CONFIG_KEY, JSON.stringify(list), JSON.stringify(list)]
      );
    }
    return NextResponse.json(list);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

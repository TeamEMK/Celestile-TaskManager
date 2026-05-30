import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

function checkSecret(req) {
  const secret = req.nextUrl.searchParams.get('secret');
  return secret && secret === process.env.DEVELOPER_SECRET;
}

export async function GET(req) {
  if (!checkSecret(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [rows] = await pool.query(
      "SELECT `value` FROM app_config WHERE `key` = 'access_enabled'"
    );
    const enabled = !rows.length || rows[0].value !== 'false';
    return NextResponse.json({ enabled });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  if (!checkSecret(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { enabled } = await req.json();
  try {
    await pool.query(
      "INSERT INTO app_config (`key`, `value`) VALUES ('access_enabled', ?) ON DUPLICATE KEY UPDATE `value` = ?",
      [String(enabled), String(enabled)]
    );
    return NextResponse.json({ success: true, enabled });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

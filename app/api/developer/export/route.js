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
    const [[delegations], [users], [masters], [holidays]] = await Promise.all([
      pool.query(`SELECT id, description, doer, due_date, client, status, priority,
                         url, remarks, approval, delegated_by, created_at, completed_at
                  FROM delegations ORDER BY created_at DESC`),
      pool.query(`SELECT id, name, email, phone, department, roles, active FROM users ORDER BY name`),
      pool.query(`SELECT id, task, assigned_to, frequency FROM masters`),
      pool.query(`SELECT id, date, name, type FROM holidays ORDER BY date`),
    ]);

    return NextResponse.json({ delegations, users, masters, holidays });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

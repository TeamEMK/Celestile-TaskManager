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
      pool.query(`SELECT id, description, doer, due_date AS due_date, client, status, priority,
                         url, remarks, approval, delegated_by, created_at, completed_at,
                         transferred_from, transferred_by
                  FROM delegations ORDER BY created_at DESC`),
      pool.query(`SELECT id, name, email, phone, department, roles, active, created_at FROM users ORDER BY name`),
      pool.query(`SELECT id, task, assigned_to, frequency, created_at FROM masters`),
      pool.query(`SELECT id, date, name, type FROM holidays ORDER BY date`),
    ]);

    return NextResponse.json({ delegations, users, masters, holidays });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

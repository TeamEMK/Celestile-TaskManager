import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/api';

export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const userId = new URL(req.url).searchParams.get('userId');
    const [rows] = userId
      ? await pool.query(
          `SELECT id, user_id AS userId, user_name AS userName, type,
                  from_date AS fromDate, to_date AS toDate, reason, status,
                  approver, created_at AS createdAt, decided_at AS decidedAt
           FROM leaves WHERE user_id = ? ORDER BY created_at DESC`, [userId])
      : await pool.query(
          `SELECT id, user_id AS userId, user_name AS userName, type,
                  from_date AS fromDate, to_date AS toDate, reason, status,
                  approver, created_at AS createdAt, decided_at AS decidedAt
           FROM leaves ORDER BY created_at DESC`);
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.userName || !body.fromDate || !body.toDate)
      return NextResponse.json({ error: 'userName, fromDate, toDate required' }, { status: 400 });

    const [c] = await pool.query('SELECT COUNT(*) AS cnt FROM leaves');
    const id  = 'LV' + (Number(c[0].cnt) + 1).toString().padStart(4, '0');

    await pool.query(
      'INSERT INTO leaves (id, user_id, user_name, type, from_date, to_date, reason, status, approver) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, body.userId || null, body.userName, body.type || 'Leave',
       body.fromDate, body.toDate, body.reason || '', 'pending', body.approver || 'HOD']
    );
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    await ensureSchema();
    const body = await req.json();
    if (!body.id || !body.status)
      return NextResponse.json({ error: 'id and status required' }, { status: 400 });
    await pool.query('UPDATE leaves SET status = ?, decided_at = NOW() WHERE id = ?',
      [body.status, body.id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// GET /api/leaves            -> all (admin/approver)
// GET /api/leaves?userId=U1  -> that user's leaves
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    const rows = userId
      ? await sql`
          SELECT id, user_id AS "userId", user_name AS "userName", type,
                 from_date AS "fromDate", to_date AS "toDate", reason, status,
                 approver, created_at AS "createdAt", decided_at AS "decidedAt"
          FROM leaves WHERE user_id = ${userId}
          ORDER BY created_at DESC`
      : await sql`
          SELECT id, user_id AS "userId", user_name AS "userName", type,
                 from_date AS "fromDate", to_date AS "toDate", reason, status,
                 approver, created_at AS "createdAt", decided_at AS "decidedAt"
          FROM leaves ORDER BY created_at DESC`;

    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/leaves
// body: { userId, userName, type, fromDate, toDate, reason, approver }
export async function POST(req) {
  try {
    const body = await req.json();
    if (!body.userName || !body.fromDate || !body.toDate) {
      return NextResponse.json(
        { error: 'userName, fromDate, toDate required' },
        { status: 400 }
      );
    }

    const countRes = await sql`SELECT COUNT(*) FROM leaves`;
    const id = 'LV' + (Number(countRes[0].count) + 1).toString().padStart(4, '0');

    await sql`
      INSERT INTO leaves
        (id, user_id, user_name, type, from_date, to_date, reason, status, approver)
      VALUES (
        ${id}, ${body.userId || null}, ${body.userName}, ${body.type || 'Leave'},
        ${body.fromDate}, ${body.toDate}, ${body.reason || ''}, 'pending',
        ${body.approver || 'HOD'}
      )`;

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/leaves   body: { id, status: 'approved' | 'rejected' }
export async function PATCH(req) {
  try {
    const body = await req.json();
    if (!body.id || !body.status) {
      return NextResponse.json({ error: 'id and status required' }, { status: 400 });
    }
    await sql`
      UPDATE leaves
      SET status = ${body.status}, decided_at = NOW()
      WHERE id = ${body.id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

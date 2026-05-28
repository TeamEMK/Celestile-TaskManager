import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const sql = neon(process.env.DATABASE_URL);

function normDate(s) {
  if (!s) return null;
  const t = String(s).trim().replaceAll('/', '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export async function GET() {
  try {
    const delegations = await sql`
      SELECT
        id, description, doer_id AS "doerId", doer,
        delegated_by AS "delegatedBy", due_date AS "dueDate",
        client, status, type,
        priority, approval, url, remarks,
        created_at AS "createdAt", completed_at AS "completedAt"
      FROM delegations
      ORDER BY created_at DESC`;
    return NextResponse.json(delegations);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function nextId() {
  const count = await sql`SELECT COUNT(*) FROM delegations`;
  return 'DEL' + (Number(count[0].count) + 1).toString().padStart(3, '0');
}

async function insertOne({ description, doerId, doerName, delegatedBy, dueDate, client, priority, approval, url, remarks }) {
  const id = await nextId();
  const res = await sql`
    INSERT INTO delegations (
      id, description, doer_id, doer, delegated_by, due_date,
      client, status, type, priority, approval, url, remarks
    ) VALUES (
      ${id}, ${description}, ${doerId}, ${doerName || ''}, ${delegatedBy || 'U001'},
      ${dueDate}, ${client || ''}, 'pending', 'delegation',
      ${priority || 'Low'}, ${approval || 'No Approval'}, ${url || ''}, ${remarks || ''}
    ) RETURNING *`;
  return res[0];
}

export async function POST(req) {
  try {
    const body = await req.json();

    // ---- BULK (CSV) ----
    if (Array.isArray(body.bulk)) {
      let inserted = 0; const errors = [];
      for (const [i, row] of body.bulk.entries()) {
        const email = (row.doer_email || row.doerEmail || '').trim().toLowerCase();
        const dueDate = normDate(row.due_date || row.dueDate);
        const desc = (row.description || '').trim();
        if (!email || !dueDate || !desc) { errors.push(`Row ${i + 1}: missing doer_email/due_date/description`); continue; }
        const users = await sql`SELECT id, name FROM users WHERE LOWER(email) = ${email}`;
        if (!users.length) { errors.push(`Row ${i + 1}: no user with email ${email}`); continue; }
        await insertOne({
          description: desc, doerId: users[0].id, doerName: users[0].name,
          delegatedBy: body.delegatedBy, dueDate,
          priority: row.priority, approval: row.approval,
          url: row.url, remarks: row.remarks,
        });
        inserted++;
      }
      return NextResponse.json({ success: true, inserted, errors }, { status: 201 });
    }

    // ---- SINGLE ----
    if (!body.description || !body.doerId || !body.dueDate) {
      return NextResponse.json({ error: 'description, doerId, dueDate required' }, { status: 400 });
    }
    const users = await sql`SELECT * FROM users WHERE id = ${body.doerId}`;
    const row = await insertOne({
      description: body.description,
      doerId: body.doerId,
      doerName: users[0]?.name,
      delegatedBy: body.delegatedBy,
      dueDate: normDate(body.dueDate) || body.dueDate,
      client: body.client,
      priority: body.priority,
      approval: body.approval,
      url: body.url,
      remarks: body.remarks,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json();

    // Bulk transfer: fromDoer ke saare tasks toDoer ko assign karo
    if (body.action === 'transfer') {
      const { fromDoer, toDoer, toDoerId } = body;
      if (!fromDoer || !toDoer) return NextResponse.json({ error: 'fromDoer and toDoer required' }, { status: 400 });
      await sql`UPDATE delegations SET doer = ${toDoer}, doer_id = ${toDoerId || null} WHERE doer = ${fromDoer} AND status != 'done'`;
      return NextResponse.json({ success: true });
    }

    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    // Approval gate: a non-admin can NEVER directly revise — it becomes a
    // pending request that an admin must grant.
    let status = body.status;
    if (status === 'revise') {
      const session = await getServerSession(authOptions);
      const isAdmin = (session?.user?.roles || []).includes('Admin');
      if (!isAdmin) status = 'revise_requested';
    }

    const result = await sql`
      UPDATE delegations SET
        status = COALESCE(${status}, status),
        description = COALESCE(${body.description}, description),
        due_date = COALESCE(${body.dueDate}, due_date),
        client = COALESCE(${body.client}, client),
        priority = COALESCE(${body.priority}, priority),
        approval = COALESCE(${body.approval}, approval),
        url = COALESCE(${body.url}, url),
        remarks = COALESCE(${body.remarks}, remarks),
        completed_at = CASE WHEN ${status} = 'done' THEN NOW() ELSE completed_at END
      WHERE id = ${body.id}
      RETURNING *`;
    if (!result.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(result[0]);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
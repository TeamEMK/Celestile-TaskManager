import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

function normDate(s) {
  if (!s) return null;
  const t = String(s).trim().replaceAll('/', '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

export async function GET() {
  try {
    await ensureSchema();
    const [rows] = await pool.query(
      `SELECT id, description, doer_id AS doerId, doer,
              delegated_by AS delegatedBy, due_date AS dueDate,
              client, status, type, priority, approval, url, remarks,
              created_at AS createdAt, completed_at AS completedAt
       FROM delegations ORDER BY created_at DESC`
    );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function nextDelId() {
  const [c] = await pool.query('SELECT COUNT(*) AS cnt FROM delegations');
  return 'DEL' + (Number(c[0].cnt) + 1).toString().padStart(3, '0');
}

async function insertOne({ description, doerId, doerName, delegatedBy, dueDate, client, priority, approval, url, remarks }) {
  const id = await nextDelId();
  const initialStatus = 'pending';
  await pool.query(
    `INSERT INTO delegations
      (id, description, doer_id, doer, delegated_by, due_date, client, status, type,
       priority, approval, url, remarks, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'delegation', ?, ?, ?, ?, NOW())`,
    [id, description, doerId, doerName || '', delegatedBy || null,
     dueDate, client || '', initialStatus,
     priority || 'Low', approval || 'No Approval', url || '', remarks || '']
  );
  const [result] = await pool.query('SELECT * FROM delegations WHERE id = ?', [id]);
  return result[0];
}

export async function POST(req) {
  try {
    const body = await req.json();

    // Check if delegator is admin — admin ka delegate auto-approved hota hai
    const session = await getServerSession(authOptions);
    const delegatorRoles = session?.user?.roles || [];
    const delegatorIsAdmin = Array.isArray(delegatorRoles)
      ? delegatorRoles.includes('Admin')
      : String(delegatorRoles).includes('Admin');

    // Admin delegate kare toh "Approval Required" auto "Approved" ho jaata hai
    const resolvedApproval = (delegatorIsAdmin && body.approval === 'Approval Required')
      ? 'Approved'
      : (body.approval || 'No Approval');

    // JSON store fallback when no MySQL
    if (!process.env.DB_HOST) {
      const { readStore, writeStore } = await import('@/lib/store');
      const store = await readStore();
      const delegations = store.delegations || [];

      const doerUser = (store.users || []).find(u => u.id === body.doerId);
      const doerName = doerUser?.name || body.doerName || body.doer || '';

      const id = 'DEL' + String(delegations.length + 1).padStart(3, '0');

      const newDel = {
        id, description: body.description,
        doerId: body.doerId, doer: doerName,
        delegatedBy: body.delegatedBy,
        dueDate: normDate(body.dueDate) || body.dueDate,
        client: body.client || '', status: 'pending', type: 'delegation',
        priority: body.priority || 'Low', approval: resolvedApproval,
        url: body.url || '', remarks: body.remarks || '',
        createdAt: new Date().toISOString(),
      };
      delegations.push(newDel);
      store.delegations = delegations;
      await writeStore(store);
      return NextResponse.json(newDel, { status: 201 });
    }

    await ensureSchema();

    // Bulk CSV
    if (Array.isArray(body.bulk)) {
      let inserted = 0; const errors = [];
      for (const [i, row] of body.bulk.entries()) {
        const email   = (row.doer_email || row.doerEmail || '').trim().toLowerCase();
        const dueDate = normDate(row.due_date || row.dueDate);
        const desc    = (row.description || '').trim();
        if (!email || !dueDate || !desc) { errors.push(`Row ${i+1}: missing fields`); continue; }
        const [users] = await pool.query('SELECT id, name FROM users WHERE LOWER(email) = ?', [email]);
        if (!users.length) { errors.push(`Row ${i+1}: no user ${email}`); continue; }
        await insertOne({
          description: desc, doerId: users[0].id, doerName: users[0].name,
          delegatedBy: body.delegatedBy, dueDate,
          priority: row.priority, approval: resolvedApproval, url: row.url, remarks: row.remarks,
        });
        inserted++;
      }
      return NextResponse.json({ success: true, inserted, errors }, { status: 201 });
    }

    // Single
    if (!body.description || !body.doerId || !body.dueDate)
      return NextResponse.json({ error: 'description, doerId, dueDate required' }, { status: 400 });
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [body.doerId]);
    const row = await insertOne({
      description: body.description, doerId: body.doerId, doerName: users[0]?.name,
      delegatedBy: body.delegatedBy, dueDate: normDate(body.dueDate) || body.dueDate,
      client: body.client, priority: body.priority, approval: resolvedApproval,
      url: body.url, remarks: body.remarks,
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

    // JSON store fallback when no MySQL
    if (!process.env.DB_HOST) {
      const session = await getServerSession(authOptions);
      const { readStore, writeStore } = await import('@/lib/store');
      const store = await readStore();

      // Transfer action
      if (body.action === 'transfer') {
        const { fromDoer, toDoer, toDoerId, taskIds } = body;
        if (!fromDoer || !toDoer)
          return NextResponse.json({ error: 'fromDoer and toDoer required' }, { status: 400 });
        const transferredBy = session?.user?.name || null;
        const idSet = taskIds?.length ? new Set(taskIds) : null;
        store.delegations = (store.delegations || []).map(d => {
          const match = idSet ? idSet.has(d.id) : (d.doer === fromDoer && d.status !== 'done');
          return match && d.status !== 'done'
            ? { ...d, doer: toDoer, doerId: toDoerId || d.doerId, transferredBy, transferredFrom: d.doer }
            : d;
        });
        await writeStore(store);
        return NextResponse.json({ success: true });
      }

      const del = (store.delegations || []).find(d => d.id === body.id);
      if (!del) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      let newStatus = body.status;

      if (newStatus === 'revise') {
        if (body._grantRevise) {
          // Admin explicitly granting someone's revise request
          del.reviseAction = 'granted';
        } else {
          // Everyone (including admin) must request approval
          newStatus = 'revise_requested';
          del.reviseAction = 'pending';
        }
      } else if (newStatus === 'pending' && body._denyRevise) {
        del.reviseAction = 'denied';
      }

      if (newStatus) del.status = newStatus;
      if (body.dueDate) del.dueDate = body.dueDate;
      if (body.remarks !== undefined) del.remarks = body.remarks;
      if (body.approval !== undefined) del.approval = body.approval;
      if (newStatus === 'done') del.completedAt = new Date().toISOString();
      await writeStore(store);
      return NextResponse.json(del);
    }

    await ensureSchema();

    // Transfer (all or selective by taskIds)
    if (body.action === 'transfer') {
      const { fromDoer, toDoer, toDoerId, taskIds } = body;
      if (!fromDoer || !toDoer)
        return NextResponse.json({ error: 'fromDoer and toDoer required' }, { status: 400 });
      const tSession = await getServerSession(authOptions);
      const transferredBy = tSession?.user?.name || null;
      if (taskIds?.length) {
        const placeholders = taskIds.map(() => '?').join(',');
        await pool.query(
          `UPDATE delegations SET doer = ?, doer_id = ?, transferred_by = ?, transferred_from = doer
           WHERE id IN (${placeholders}) AND status != 'done'`,
          [toDoer, toDoerId || null, transferredBy, ...taskIds]
        );
      } else {
        await pool.query(
          `UPDATE delegations SET doer = ?, doer_id = ?, transferred_by = ?, transferred_from = doer
           WHERE doer = ? AND status != 'done'`,
          [toDoer, toDoerId || null, transferredBy, fromDoer]
        );
      }
      return NextResponse.json({ success: true });
    }

    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    let status = body.status;
    let reviseAction = null;

    if (status === 'revise') {
      if (body._grantRevise) {
        // Admin explicitly granting someone's revise request
        reviseAction = 'granted';
      } else {
        // Everyone (including admin) must request approval
        status = 'revise_requested';
        reviseAction = 'pending';
      }
    } else if (status === 'pending' && body._denyRevise) {
      reviseAction = 'denied';
    }

    await pool.query(
      `UPDATE delegations SET
        status        = COALESCE(?, status),
        description   = COALESCE(?, description),
        due_date      = COALESCE(?, due_date),
        client        = COALESCE(?, client),
        priority      = COALESCE(?, priority),
        approval      = COALESCE(?, approval),
        url           = COALESCE(?, url),
        remarks       = COALESCE(?, remarks),
        revise_action = COALESCE(?, revise_action),
        completed_at  = CASE WHEN ? = 'done' THEN NOW() ELSE completed_at END
       WHERE id = ?`,
      [status ?? null, body.description ?? null, body.dueDate ?? null,
       body.client ?? null, body.priority ?? null, body.approval ?? null,
       body.url ?? null, body.remarks ?? null, reviseAction,
       status, body.id]
    );

    const [result] = await pool.query('SELECT * FROM delegations WHERE id = ?', [body.id]);
    if (!result.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(result[0]);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendWhatsApp, delegationMessage, isWhatsappConfigured } from '@/lib/whatsapp';
import { requireUser } from '@/lib/api';

// Fire a WhatsApp "task delegated" notice to the doer (best-effort).
async function notifyDelegation({ doerUser, delegatedById, del }) {
  try {
    if (!isWhatsappConfigured() || !doerUser?.phone) return;
    let byName = '';
    if (delegatedById) {
      const [b] = await pool.query('SELECT name FROM users WHERE id = ?', [delegatedById]);
      byName = b[0]?.name || '';
    }
    const msg = delegationMessage({
      doerName: doerUser.name || del.doer,
      byName,
      dueDate: del.due_date || del.dueDate,
      priority: del.priority,
      approval: del.approval,
      description: del.description,
    });
    await sendWhatsApp(doerUser.phone, msg);
  } catch (e) { console.error('[notifyDelegation]', e.message); }
}

function normDate(s) {
  if (!s) return null;
  const t = String(s).trim().replaceAll('/', '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const [rows] = await pool.query(
      `SELECT id, description, doer_id AS doerId, doer,
              delegated_by AS delegatedBy, due_date AS dueDate,
              client, status, type, priority, approval, url, remarks, image,
              require_file AS requireFile, attachment,
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

async function insertOne({ description, doerId, doerName, delegatedBy, dueDate, client, priority, approval, url, remarks, image, requireFile, attachment }) {
  const id = await nextDelId();
  const initialStatus = 'pending';
  await pool.query(
    `INSERT INTO delegations
      (id, description, doer_id, doer, delegated_by, due_date, client, status, type,
       priority, approval, url, remarks, image, require_file, attachment, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'delegation', ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [id, description, doerId, doerName || '', delegatedBy || null,
     dueDate, client || '', initialStatus,
     priority || 'Low', approval || 'No Approval', url || '', remarks || '', image || '',
     requireFile ? 1 : 0, attachment || null]
  );
  const [result] = await pool.query('SELECT * FROM delegations WHERE id = ?', [id]);
  return result[0];
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const body = await req.json();
    const resolvedApproval = body.approval || 'No Approval';
    await ensureSchema();

    // Bulk CSV
    if (Array.isArray(body.bulk)) {
      let inserted = 0; const errors = [];
      for (const [i, row] of body.bulk.entries()) {
        const email   = (row.doer_email || row.doerEmail || '').trim().toLowerCase();
        const dueDate = normDate(row.due_date || row.dueDate);
        const desc    = (row.description || '').trim();
        if (!email || !dueDate || !desc) { errors.push(`Row ${i+1}: missing fields`); continue; }
        const [users] = await pool.query('SELECT id, name, phone FROM users WHERE LOWER(email) = ?', [email]);
        if (!users.length) { errors.push(`Row ${i+1}: no user ${email}`); continue; }
        const del = await insertOne({
          description: desc, doerId: users[0].id, doerName: users[0].name,
          delegatedBy: body.delegatedBy, dueDate,
          priority: row.priority, approval: resolvedApproval, url: row.url, remarks: row.remarks,
        });
        await notifyDelegation({ doerUser: users[0], delegatedById: body.delegatedBy, del });
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
      url: body.url, remarks: body.remarks, image: body.image,
      requireFile: body.requireFile, attachment: body.attachment,
    });
    await notifyDelegation({ doerUser: users[0], delegatedById: body.delegatedBy, del: row });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const body = await req.json();
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
          `UPDATE delegations SET transferred_from = doer, transferred_by = ?, doer = ?, doer_id = ?
           WHERE id IN (${placeholders}) AND status != 'done'`,
          [transferredBy, toDoer, toDoerId || null, ...taskIds]
        );
      } else {
        await pool.query(
          `UPDATE delegations SET transferred_from = doer, transferred_by = ?, doer = ?, doer_id = ?
           WHERE doer = ? AND status != 'done'`,
          [transferredBy, toDoer, toDoerId || null, fromDoer]
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
        status           = COALESCE(?, status),
        description      = COALESCE(?, description),
        due_date         = COALESCE(?, due_date),
        client           = COALESCE(?, client),
        priority         = COALESCE(?, priority),
        approval         = COALESCE(?, approval),
        url              = COALESCE(?, url),
        remarks          = COALESCE(?, remarks),
        revise_action    = COALESCE(?, revise_action),
        completion_file  = COALESCE(?, completion_file),
        completed_at     = CASE WHEN ? = 'done' THEN NOW() ELSE completed_at END
       WHERE id = ?`,
      [status ?? null, body.description ?? null, body.dueDate ?? null,
       body.client ?? null, body.priority ?? null, body.approval ?? null,
       body.url ?? null, body.remarks ?? null, reviseAction,
       body.completionFile ?? null,
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

export async function DELETE(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await ensureSchema();
    await pool.query('DELETE FROM delegations WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

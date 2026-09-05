import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, delegationMessage, taskDoneMessage, approvalWaitingMessage, isWhatsappConfigured } from '@/lib/whatsapp';
import { requireUser, requireUserCtx, currentUser } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { maybeUploadToDrive } from '@/lib/googleDrive';
import { newId } from '@/lib/ids';

// Fire a WhatsApp "task delegated" notice to the doer (best-effort).
async function notifyDelegation({ doerUser, delegatedById, del }) {
  try {
    if (!isWhatsappConfigured()) return;
    if (!doerUser?.phone) { console.error('[notifyDelegation] skipped — doer has no phone on file:', doerUser?.name || del.doer); return; }
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

// Fire a WhatsApp "task completed" notice back to whoever delegated it (best-effort).
async function notifyTaskDone(delegation) {
  try {
    if (!isWhatsappConfigured()) return;
    if (!delegation?.delegated_by) { console.error('[notifyTaskDone] skipped — delegation has no delegated_by (assignee) id:', delegation?.id); return; }
    const [byUsers] = await pool.query('SELECT name, phone FROM users WHERE id = ?', [delegation.delegated_by]);
    const byUser = byUsers[0];
    if (!byUser?.phone) { console.error('[notifyTaskDone] skipped — assignee has no phone on file:', byUser?.name || delegation.delegated_by); return; }
    const msg = taskDoneMessage({
      byName: byUser.name,
      doerName: delegation.doer,
      description: delegation.description,
    });
    await sendWhatsApp(byUser.phone, msg);
  } catch (e) { console.error('[notifyTaskDone]', e.message); }
}

// Fire a WhatsApp notice to the chosen approver when a task starts waiting on them.
async function notifyApprovalWaiting(delegation) {
  try {
    if (!isWhatsappConfigured()) return;
    if (!delegation?.approver_id) { console.error('[notifyApprovalWaiting] skipped — no approver_id:', delegation?.id); return; }
    const [approvers] = await pool.query('SELECT name, phone FROM users WHERE id = ?', [delegation.approver_id]);
    const approver = approvers[0];
    if (!approver?.phone) { console.error('[notifyApprovalWaiting] skipped — approver has no phone on file:', approver?.name || delegation.approver_id); return; }
    const msg = approvalWaitingMessage({
      approverName: approver.name,
      doerName: delegation.doer,
      description: delegation.description,
    });
    await sendWhatsApp(approver.phone, msg);
  } catch (e) { console.error('[notifyApprovalWaiting]', e.message); }
}

/**
 * Who may touch a delegation.
 *
 * Being signed in used to be the whole check, so any user could mark anyone
 * else's task done, rewrite it, delete it, or bulk-transfer a colleague's
 * entire workload to someone else. The rules are per-task:
 *
 *   doer        - may move the task's own status (done / revise / reopen)
 *   delegator   - may do that AND edit the task's contents, reassign, delete
 *   Admin / HOD - everything
 *
 * `delegated_by` and `doer_id` are ids; `doer` is a denormalised name kept for
 * old rows that were created before doer_id existed, hence the name fallback.
 */
function relationTo(row, user) {
  if (!user) return { isAdmin: false, isDoer: false, isDelegator: false };
  const me = String(user.id ?? '');
  const isDoer = (row.doer_id != null && String(row.doer_id) === me)
    || (!row.doer_id && !!row.doer && String(row.doer) === String(user.name ?? ''));
  return {
    isAdmin: isAdminRoles(user.roles),
    isDoer,
    isDelegator: row.delegated_by != null && String(row.delegated_by) === me,
  };
}

// Status moves and completion proof: doer, delegator or admin.
function canProgress(row, user) {
  const r = relationTo(row, user);
  return r.isAdmin || r.isDoer || r.isDelegator;
}

// Rewriting the task itself (text, dates, priority, who it belongs to) and
// deleting it: only the person who handed it out, or an admin. A doer must not
// be able to reword or reassign the task they were given.
function canEdit(row, user) {
  const r = relationTo(row, user);
  return r.isAdmin || r.isDelegator;
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

// COUNT(*)+1 collided once any row had ever been deleted (count drops below the
// highest id already used) — e.g. "Duplicate entry 'DEL568' for key 'PRIMARY'".
// The local timestamp+random replacement is now the shared one in lib/ids.js,
// which every table uses and which guarantees uniqueness instead of making it
// merely likely (the random half here was birthday-bound).
const nextDelId = () => newId('DEL');

async function insertOne({ description, doerId, doerName, delegatedBy, dueDate, client, priority, approval, approverId, approverName, url, remarks, image, requireFile, attachment }) {
  const id = nextDelId();
  const initialStatus = 'pending';
  const [uploadedImage, uploadedAttachment] = await Promise.all([
    maybeUploadToDrive(image, 'delegation-image'),
    maybeUploadToDrive(attachment, 'delegation-attachment'),
  ]);
  await pool.query(
    `INSERT INTO delegations
      (id, description, doer_id, doer, delegated_by, due_date, client, status, type,
       priority, approval, approver_id, approver, url, remarks, image, require_file, attachment, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'delegation', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [id, description, doerId, doerName || '', delegatedBy || null,
     dueDate, client || '', initialStatus,
     priority || 'Low', approval || 'No Approval', approverId || null, approverName || '',
     url || '', remarks || '', uploadedImage || '',
     requireFile ? 1 : 0, uploadedAttachment || null]
  );
  const [result] = await pool.query('SELECT * FROM delegations WHERE id = ?', [id]);
  return result[0];
}

export async function POST(req) {
  // delegatedBy must come from the server-verified session, never from the
  // request body — trusting a client-supplied id let a stale/not-yet-loaded
  // session (or a wrong value) silently attribute a task to nobody/someone
  // else, so it would never show up under the real delegator's "Delegate by
  // Me" tab (that tab filters strictly on delegatedBy === session.user.id).
  const sessionUser = await currentUser();
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const resolvedApproval = body.approval || 'No Approval';
    await ensureSchema();

    // Bulk CSV
    if (Array.isArray(body.bulk)) {
      let inserted = 0; const errors = [];
      for (const [i, row] of body.bulk.entries()) {
        const email      = (row.doer_email || row.doerEmail || '').trim().toLowerCase();
        const dueDate     = normDate(row.due_date || row.dueDate);
        const desc        = (row.description || '').trim();
        const rowApproval = row.approval || resolvedApproval;
        if (!email || !dueDate || !desc) { errors.push(`Row ${i+1}: missing fields`); continue; }
        const [users] = await pool.query('SELECT id, name, phone FROM users WHERE LOWER(email) = ?', [email]);
        if (!users.length) { errors.push(`Row ${i+1}: no user ${email}`); continue; }
        let approverId = '', approverName = '';
        const approverEmail = (row.approver_email || row.approverEmail || '').trim().toLowerCase();
        if (rowApproval === 'Approval Required' && approverEmail) {
          const [approvers] = await pool.query('SELECT id, name FROM users WHERE LOWER(email) = ?', [approverEmail]);
          if (approvers.length) { approverId = approvers[0].id; approverName = approvers[0].name; }
        }
        const del = await insertOne({
          description: desc, doerId: users[0].id, doerName: users[0].name,
          delegatedBy: sessionUser.id, dueDate,
          priority: row.priority, approval: rowApproval, approverId, approverName,
          url: row.url, remarks: row.remarks,
        });
        await notifyDelegation({ doerUser: users[0], delegatedById: sessionUser.id, del });
        inserted++;
      }
      return NextResponse.json({ success: true, inserted, errors }, { status: 201 });
    }

    // Single
    if (!body.description || !body.doerId || !body.dueDate)
      return NextResponse.json({ error: 'description, doerId, dueDate required' }, { status: 400 });
    if (resolvedApproval === 'Approval Required' && !body.approverId)
      return NextResponse.json({ error: 'approverId required when approval is required' }, { status: 400 });
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [body.doerId]);
    let approverName = '';
    if (body.approverId) {
      const [approvers] = await pool.query('SELECT name FROM users WHERE id = ?', [body.approverId]);
      approverName = approvers[0]?.name || '';
    }
    const row = await insertOne({
      description: body.description, doerId: body.doerId, doerName: users[0]?.name,
      delegatedBy: sessionUser.id, dueDate: normDate(body.dueDate) || body.dueDate,
      client: body.client, priority: body.priority, approval: resolvedApproval,
      approverId: body.approverId, approverName,
      url: body.url, remarks: body.remarks, image: body.image,
      requireFile: body.requireFile, attachment: body.attachment,
    });
    await notifyDelegation({ doerUser: users[0], delegatedById: sessionUser.id, del: row });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  const { gate, user: sessionUser } = await requireUserCtx(); if (gate) return gate;
  const callerIsAdmin = isAdminRoles(sessionUser.roles);
  try {
    const body = await req.json();
    await ensureSchema();

    // Transfer (all or selective by taskIds)
    if (body.action === 'transfer') {
      const { fromDoer, toDoer, toDoerId, taskIds } = body;
      if (!fromDoer || !toDoer)
        return NextResponse.json({ error: 'fromDoer and toDoer required' }, { status: 400 });
      // A non-admin may hand off their OWN queue and nothing else. Without
      // this, `fromDoer` was simply whatever name the client typed, so any
      // user could move a colleague's entire open workload onto someone else.
      if (!callerIsAdmin && String(fromDoer) !== String(sessionUser.name ?? '')) {
        return NextResponse.json({ error: 'You can only transfer your own tasks' }, { status: 403 });
      }
      const transferredBy = sessionUser.name || null;
      // Two Sheets-engine constraints shape this block: `WHERE id IN (...)` is
      // not parseable (so selective transfer is one UPDATE per id, batched in
      // a transaction = one sheet flush), and `SET transferred_from = doer`
      // wrote the literal string "doer" (a bare column on the right-hand side
      // isn't resolved) — the old doer is `fromDoer`, so stamp that value.
      if (taskIds?.length) {
        // The doer condition stays in the UPDATE for non-admins so a hand-picked
        // list of ids can't reach past the caller's own rows.
        const ownership = callerIsAdmin ? '' : ' AND doer = ?';
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          for (const id of taskIds) {
            await conn.query(
              `UPDATE delegations SET transferred_from = ?, transferred_by = ?, doer = ?, doer_id = ?
               WHERE id = ? AND status != 'done'${ownership}`,
              callerIsAdmin
                ? [fromDoer, transferredBy, toDoer, toDoerId || null, id]
                : [fromDoer, transferredBy, toDoer, toDoerId || null, id, fromDoer]
            );
          }
          await conn.commit();
        } catch (e) {
          try { await conn.rollback(); } catch { /* ignore */ }
          throw e;
        } finally {
          conn.release();
        }
      } else {
        await pool.query(
          `UPDATE delegations SET transferred_from = ?, transferred_by = ?, doer = ?, doer_id = ?
           WHERE doer = ? AND status != 'done'`,
          [fromDoer, transferredBy, toDoer, toDoerId || null, fromDoer]
        );
      }
      return NextResponse.json({ success: true });
    }

    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const [existingRows] = await pool.query('SELECT * FROM delegations WHERE id = ?', [body.id]);
    const current = existingRows[0];
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let status = body.status;
    let reviseAction = null;
    let waitingForApproval = false;

    const isApproverAction = body._approverAction === 'approve' || body._approverAction === 'reject';

    // Does this request rewrite the task itself, or only move its status? The
    // two carry different rights — see canEdit() / canProgress() above.
    //
    // dueDate is deliberately NOT in this list: asking for a revise means
    // proposing a new date for the work, and that request comes from the doer.
    // Treating it as an edit would have made the doer's own revise flow a 403.
    // The grant/deny side of that exchange is gated separately below.
    const EDIT_FIELDS = ['description', 'client', 'priority', 'approval', 'url', 'doerId', 'doer'];
    const isEdit = EDIT_FIELDS.some((k) => body[k] !== undefined)
      || (body.dueDate !== undefined && status !== 'revise');

    if (!isApproverAction) {
      if (isEdit && !canEdit(current, sessionUser)) {
        return NextResponse.json(
          { error: 'Only the person who delegated this task (or an admin) can edit it' }, { status: 403 });
      }
      if (!canProgress(current, sessionUser)) {
        return NextResponse.json({ error: 'This task is not yours to change' }, { status: 403 });
      }
      // Granting or denying a revise request is an approval decision, not
      // something the requester can hand to themselves.
      if ((body._grantRevise || body._denyRevise) && !canEdit(current, sessionUser)) {
        return NextResponse.json(
          { error: 'Only the delegator or an admin can decide a revise request' }, { status: 403 });
      }
    }

    if (isApproverAction) {
      if (current.status !== 'approval_pending')
        return NextResponse.json({ error: 'Task is not waiting for approval' }, { status: 400 });
      if (String(sessionUser.id) !== String(current.approver_id))
        return NextResponse.json({ error: 'Only the assigned approver can decide this task' }, { status: 403 });
      status = body._approverAction === 'approve' ? 'done' : 'revise';
      // Direct revise (bypasses the request/grant cycle) — the approver's decision is final.
    } else if (status === 'done' && current.approval === 'Approval Required' && current.approver_id) {
      // Doer marking an approval-gated task done — hold it for the chosen approver instead.
      status = 'approval_pending';
      waitingForApproval = true;
    } else if (status === 'revise') {
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

    const completionFile = await maybeUploadToDrive(body.completionFile, 'completion-proof');

    // Reassignment from the Edit Task modal. That modal has always sent `doer`
    // and `doerId`, but the UPDATE below had no columns for them — the save
    // reported success and the task silently stayed with the old doer. Resolve
    // the name from the id rather than trusting the one the client sent.
    let newDoerId = null, newDoerName = null;
    if (body.doerId !== undefined && String(body.doerId ?? '') !== String(current.doer_id ?? '')) {
      const wanted = String(body.doerId ?? '');
      if (wanted) {
        const [du] = await pool.query('SELECT id, name FROM users WHERE id = ?', [wanted]);
        if (!du.length) return NextResponse.json({ error: 'Unknown doer' }, { status: 400 });
        newDoerId = du[0].id;
        newDoerName = du[0].name;
      }
    }

    // due_date is a DATE column: run the same normaliser the insert path uses,
    // so 'DD/MM/YYYY' out of the edit form doesn't reach MySQL raw.
    const newDueDate = body.dueDate === undefined ? null : (normDate(body.dueDate) || body.dueDate || null);

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
        doer_id          = COALESCE(?, doer_id),
        doer             = COALESCE(?, doer),
        completed_at     = CASE WHEN ? = 'done' THEN NOW() ELSE completed_at END
       WHERE id = ?`,
      [status ?? null, body.description ?? null, newDueDate,
       body.client ?? null, body.priority ?? null, body.approval ?? null,
       body.url ?? null, body.remarks ?? null, reviseAction,
       completionFile ?? null,
       newDoerId, newDoerName,
       // `status` (not `status ?? null`) bound undefined here whenever the
       // request carried no status — an edit-only save — and mysql2 rejects
       // undefined outright ("Bind parameters must not contain undefined"),
       // so every Edit Task save came back a 500.
       status ?? null, body.id]
    );

    const [result] = await pool.query('SELECT * FROM delegations WHERE id = ?', [body.id]);
    if (!result.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (waitingForApproval) await notifyApprovalWaiting(result[0]);
    else if (status === 'done') await notifyTaskDone(result[0]);
    return NextResponse.json(result[0]);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const { gate, user: sessionUser } = await requireUserCtx(); if (gate) return gate;
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await ensureSchema();
    // Any signed-in user could delete any task by id before this check.
    const [rows] = await pool.query('SELECT * FROM delegations WHERE id = ?', [id]);
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canEdit(rows[0], sessionUser)) {
      return NextResponse.json(
        { error: 'Only the person who delegated this task (or an admin) can delete it' }, { status: 403 });
    }
    await pool.query('DELETE FROM delegations WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

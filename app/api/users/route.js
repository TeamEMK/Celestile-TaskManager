import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { requireUser, requireUserCtx, requireAdmin, currentUser, sanitizeUser, sanitizeUsers } from '@/lib/api';
import { nextSeqId } from '@/lib/ids';
import { maybeUploadToDrive } from '@/lib/googleDrive';

function parseRoles(role, userRole) {
  const combined = [role, userRole].join(',').toLowerCase();
  const roles = [];
  if (combined.includes('admin')) roles.push('Admin');
  if (combined.includes('hod'))   roles.push('HOD');
  if (combined.includes('user'))  roles.push('User');
  return roles.length ? roles : ['User'];
}

export async function GET() {
  const { gate, user: caller } = await requireUserCtx(); if (gate) return gate;
  const callerBranch = (caller?.branch || '').toLowerCase();
  try {
    await ensureSchema();
    // OR / LIKE are unparseable in the Sheets SQL engine (the old query threw
    // and the catch below silently fell back to the legacy JSON store) —
    // fetch everyone and apply the branch scope in JS. Admins stay visible to
    // every branch, and rows with no branch yet are not hidden.
    const [all] = await pool.query('SELECT * FROM users ORDER BY id');
    const rows = callerBranch
      ? all.filter((u) => {
          const b = String(u.branch || '').toLowerCase().trim();
          return !b || b === callerBranch || String(u.roles || '').includes('Admin');
        })
      : all;
    // sanitizeUsers strips password_hash: `SELECT *` was handing every signed-in
    // user the bcrypt hash of everyone else's password.
    // sanitizeUsers strips password_hash: `SELECT *` was handing every signed-in
    // user the bcrypt hash of everyone else's password.
    return NextResponse.json(sanitizeUsers(rows));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const body = await req.json();
    await ensureSchema();

    // Bulk upload
    if (Array.isArray(body.bulk)) {
      let inserted = 0; const errors = [];
      for (const [i, row] of body.bulk.entries()) {
        const name  = (row.name  || '').trim();
        const email = (row.email || '').trim().toLowerCase();
        if (!name || !email) { errors.push(`Row ${i+1}: name/email missing`); continue; }
        const [ex] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (ex.length) { errors.push(`Row ${i+1}: ${email} already exists`); continue; }
        const [allIds] = await pool.query('SELECT id FROM users');
        const id = nextSeqId(allIds, 'U', 3);
        const roles = parseRoles(row.role || '', row.user_role || '');
        const hash = row.password ? await bcrypt.hash(row.password, 10) : null;
        await pool.query(
          'INSERT INTO users (id,name,email,phone,department,roles,active,password_hash,created_at) VALUES (?,?,?,?,?,?,1,?,NOW())',
          [id, name, email, row.phone||'', row.department||'', roles.join(','), hash]
        );
        inserted++;
      }
      return NextResponse.json({ success: true, inserted, errors }, { status: 201 });
    }

    if (!body.name || !body.email)
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });

    // Numeric max over every row. 'ORDER BY id DESC LIMIT 1' sorted ids as
    // STRINGS, so once the table passed U999 the next id 'U1000' sorted below
    // 'U999', the sequence stuck at 999 and every further insert collided.
    const [allIds] = await pool.query('SELECT id FROM users');
    const id = nextSeqId(allIds, 'U', 3);
    const roles = body.roles?.length ? body.roles : ['User'];
    const hash = body.password ? await bcrypt.hash(body.password, 10) : null;
    await pool.query(
      'INSERT INTO users (id, name, email, phone, department, branch, roles, active, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())',
      [id, body.name.trim(), body.email.trim(), body.phone || '', body.department || '', body.branch || '', roles.join(','), hash]
    );
    if (body.picture) {
      const picture = await maybeUploadToDrive(body.picture, 'user-photo');
      await pool.query('UPDATE users SET picture = ? WHERE id = ?', [picture, id]);
    }
    const [result] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    return NextResponse.json(sanitizeUser(result[0]), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const body = await req.json();
    if (!body.id)
      return NextResponse.json({ error: 'id required' }, { status: 400 });

    await ensureSchema();
    // An empty array used to pass the truthiness test and join to '', wiping
    // the user's roles entirely. Undefined/empty means "leave roles alone".
    const roles = Array.isArray(body.roles)
      ? (body.roles.length ? body.roles.join(',') : null)
      : (body.roles || null);

    // delegations.doer is a denormalised NAME. Renaming a user used to leave
    // every one of their tasks pointing at the old name — the dashboard and
    // the reports group by that column, so the work simply vanished from their
    // list. Rename the rows with them.
    const [beforeRows] = await pool.query('SELECT name FROM users WHERE id = ?', [body.id]);
    const oldName = beforeRows[0]?.name || null;
    await pool.query(
      `UPDATE users SET
        name       = COALESCE(?, name),
        email      = COALESCE(?, email),
        phone      = COALESCE(?, phone),
        department = COALESCE(?, department),
        branch     = COALESCE(?, branch),
        roles      = COALESCE(?, roles),
        active     = COALESCE(?, active)
       WHERE id = ?`,
      [body.name ?? null, body.email ?? null, body.phone ?? null,
       body.department ?? null, body.branch ?? null, roles, body.active ?? null, body.id]
    );
    if (body.picture !== undefined) {
      const picture = await maybeUploadToDrive(body.picture, 'user-photo');
      await pool.query('UPDATE users SET picture = ? WHERE id = ?', [picture, body.id]);
    }

    const newName = body.name?.trim();
    if (newName && oldName && newName !== oldName) {
      // Match on doer_id where we have one, and fall back to the old name for
      // rows created before doer_id existed.
      await pool.query('UPDATE delegations SET doer = ? WHERE doer_id = ?', [newName, body.id]);
      await pool.query('UPDATE delegations SET doer = ? WHERE doer = ? AND doer_id IS NULL', [newName, oldName]);
      await pool.query('UPDATE daily_tasks SET doer = ? WHERE doer_id = ?', [newName, body.id]);
    }

    const [result] = await pool.query('SELECT * FROM users WHERE id = ?', [body.id]);
    if (!result.length)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(sanitizeUser(result[0]));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await ensureSchema();
    const caller = await currentUser();
    const callerBranch = (caller?.branch || '').toLowerCase();
    if (callerBranch) {
      const [target] = await pool.query('SELECT branch FROM users WHERE id = ?', [id]);
      if (target.length && (target[0].branch || '').toLowerCase() !== callerBranch) {
        return NextResponse.json({ error: 'Cannot delete user from another branch' }, { status: 403 });
      }
    }
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

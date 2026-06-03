import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

const hasDB = !!process.env.DB_HOST;

async function getStore() {
  const { readStore, writeStore } = await import('@/lib/store');
  return { readStore, writeStore };
}

export async function GET() {
  if (!hasDB) {
    const { readStore } = await getStore();
    const store = await readStore();
    return NextResponse.json(store.masters || []);
  }
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM masters ORDER BY created_at DESC');
  return NextResponse.json(rows);
}

export async function POST(req) {
  try {
    const body = await req.json();

    // Bulk CSV upload
    if (Array.isArray(body.bulk)) {
      if (!hasDB) {
        const { readStore, writeStore } = await getStore();
        const store = await readStore();
        const masters = store.masters || [];
        const users = store.users || [];
        let inserted = 0; const errors = [];
        for (const [i, row] of body.bulk.entries()) {
          const email = (row.user_email || '').trim().toLowerCase();
          const desc  = (row.description || '').trim();
          if (!email || !desc) { errors.push(`Row ${i + 1}: missing fields`); continue; }
          const user = users.find((u) => (u.email || '').toLowerCase() === email);
          if (!user) { errors.push(`Row ${i + 1}: no user ${email}`); continue; }
          const id = 'CHK' + (masters.length + 1).toString().padStart(3, '0');
          masters.push({
            id, task: desc,
            assignedTo: user.name || email,
            frequency: row.frequency || 'Daily',
            createdAt: new Date().toISOString(),
          });
          inserted++;
        }
        store.masters = masters;
        await writeStore(store);
        return NextResponse.json({ success: true, inserted, errors }, { status: 201 });
      }

      await ensureSchema();
      let inserted = 0; const errors = [];
      for (const [i, row] of body.bulk.entries()) {
        const email = (row.user_email || '').trim().toLowerCase();
        const desc  = (row.description || '').trim();
        if (!email || !desc) { errors.push(`Row ${i + 1}: missing fields`); continue; }
        const [users] = await pool.query('SELECT id, name FROM users WHERE LOWER(email) = ?', [email]);
        if (!users.length) { errors.push(`Row ${i + 1}: no user ${email}`); continue; }
        const [c] = await pool.query('SELECT COUNT(*) AS cnt FROM masters');
        const id = 'CHK' + (Number(c[0].cnt) + 1).toString().padStart(3, '0');
        await pool.query(
          'INSERT INTO masters (id, task, assigned_to, frequency, created_at) VALUES (?, ?, ?, ?, NOW())',
          [id, desc, users[0].name, row.frequency || 'Daily']
        );
        inserted++;
      }
      return NextResponse.json({ success: true, inserted, errors }, { status: 201 });
    }

    if (!body.task?.trim())
      return NextResponse.json({ error: 'Task required' }, { status: 400 });

    if (!hasDB) {
      const { readStore, writeStore } = await getStore();
      const store = await readStore();
      const masters = store.masters || [];
      const id = 'CHK' + (masters.length + 1).toString().padStart(3, '0');
      masters.push({
        id, task: body.task.trim(),
        assignedTo: body.assignedTo || '',
        frequency: body.frequency || 'Daily',
        createdAt: new Date().toISOString(),
      });
      store.masters = masters;
      await writeStore(store);
      return NextResponse.json({ success: true, id }, { status: 201 });
    }

    await ensureSchema();
    const [c] = await pool.query('SELECT COUNT(*) AS cnt FROM masters');
    const id  = 'CHK' + (Number(c[0].cnt) + 1).toString().padStart(3, '0');
    await pool.query(
      'INSERT INTO masters (id, task, assigned_to, frequency, created_at) VALUES (?, ?, ?, ?, NOW())',
      [id, body.task.trim(), body.assignedTo || '', body.frequency || 'Daily']
    );
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    if (!hasDB) {
      const { readStore, writeStore } = await getStore();
      const store = await readStore();
      const m = (store.masters || []).find((x) => x.id === body.id);
      if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (body.task)       m.task       = body.task;
      if (body.assignedTo) m.assignedTo = body.assignedTo;
      if (body.frequency)  m.frequency  = body.frequency;
      await writeStore(store);
      return NextResponse.json({ success: true });
    }

    await ensureSchema();
    await pool.query(
      'UPDATE masters SET task = COALESCE(?, task), assigned_to = COALESCE(?, assigned_to), frequency = COALESCE(?, frequency) WHERE id = ?',
      [body.task ?? null, body.assignedTo ?? null, body.frequency ?? null, body.id]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    if (!hasDB) {
      const { readStore, writeStore } = await getStore();
      const store = await readStore();
      store.masters = (store.masters || []).filter((m) => m.id !== id);
      await writeStore(store);
      return NextResponse.json({ success: true });
    }

    await ensureSchema();
    await pool.query('DELETE FROM masters WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

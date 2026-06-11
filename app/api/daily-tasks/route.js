import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, dailyTaskConfirmationMessage, isWhatsappConfigured } from '@/lib/whatsapp';

const SELECT_COLS = `id, entry_date AS entryDate, doer_id AS doerId, doer,
        client, department, description, minutes, created_at AS createdAt,
        order_number AS orderNumber, area_name AS areaName,
        task_type AS taskType, software, revision`;

export async function GET(req) {
  try {
    await ensureSchema();
    const doerId = new URL(req.url).searchParams.get('doerId');
    const [rows] = doerId
      ? await pool.query(
          `SELECT ${SELECT_COLS} FROM daily_tasks WHERE doer_id = ? ORDER BY entry_date DESC, created_at DESC`, [doerId])
      : await pool.query(
          `SELECT ${SELECT_COLS} FROM daily_tasks ORDER BY entry_date DESC, created_at DESC`);
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Look up the doer's phone, then fire the "first submission of the day"
// confirmation (best-effort — never breaks the request).
async function notifyFirstSubmission({ doerId, doer, entryDate }) {
  try {
    if (!isWhatsappConfigured()) return;
    let phone = '';
    if (doerId) {
      const [u] = await pool.query('SELECT phone FROM users WHERE id = ?', [doerId]);
      phone = u[0]?.phone || '';
    }
    if (!phone && doer) {
      const [u] = await pool.query('SELECT phone FROM users WHERE name = ?', [doer]);
      phone = u[0]?.phone || '';
    }
    if (!phone) return;
    await sendWhatsApp(phone, dailyTaskConfirmationMessage(doer, entryDate));
  } catch (e) { console.error('[dailyTask notify]', e.message); }
}

export async function POST(req) {
  try {
    await ensureSchema();
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!body.entryDate || !body.doer || rows.length === 0)
      return NextResponse.json({ error: 'entryDate, doer and at least one row required' }, { status: 400 });

    // First submission of the day for this doer? (mirrors Apps Script isFirstSubmission)
    const [existing] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM daily_tasks WHERE doer = ? AND entry_date = ?',
      [body.doer, body.entryDate]
    );
    const firstToday = Number(existing[0]?.cnt || 0) === 0;

    const [c] = await pool.query('SELECT COUNT(*) AS cnt FROM daily_tasks');
    let n = Number(c[0].cnt);

    for (const r of rows) {
      n += 1;
      const id = 'DT' + n.toString().padStart(5, '0');
      await pool.query(
        `INSERT INTO daily_tasks
           (id, entry_date, doer_id, doer, client, department, description, minutes,
            order_number, area_name, task_type, software, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, body.entryDate, body.doerId || null, body.doer,
         r.client || '', r.department || '', r.description || '', Number(r.minutes) || 0,
         r.orderNumber || '', r.areaName || '', r.taskType || '', r.software || '',
         r.revision === 'Yes' || r.revision === true ? 'Yes' : 'No']
      );
    }

    if (firstToday) {
      await notifyFirstSubmission({ doerId: body.doerId, doer: body.doer, entryDate: body.entryDate });
    }

    return NextResponse.json({ success: true, inserted: rows.length }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

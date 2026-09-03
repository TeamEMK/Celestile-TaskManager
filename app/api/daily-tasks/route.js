import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, dailyTaskConfirmationMessage, isWhatsappConfigured } from '@/lib/whatsapp';
import { requireUser, currentUser } from '@/lib/api';
import { maybeUploadToDrive } from '@/lib/googleDrive';
import { newId } from '@/lib/ids';
import { isAdminRoles } from '@/lib/pages';

const SELECT_COLS = `id, entry_date AS entryDate, doer_id AS doerId, doer,
        client, client_number AS clientNumber, department, description, minutes, created_at AS createdAt,
        order_number AS orderNumber, area_name AS areaName,
        task_type AS taskType, software, revision,
        site_location AS siteLocation, purpose_of_visit AS purposeOfVisit,
        checks_type AS checksType, kms_travelled AS kmsTravelled,
        branch, pre_install_image AS preInstallImage, pre_install_comment AS preInstallComment,
        arc_name AS arcName, arc_phone AS arcPhone, old_new_client AS oldNewClient,
        no_of_visits AS noOfVisits, remarks, order_value AS orderValue,
        adv_paid AS advPaid, balance, mode_of_pay AS modeOfPay, executive,
        till_date_received AS tillDateReceived, balance_target AS balanceTarget`;

export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  const caller = await currentUser();
  const callerBranch = (caller?.branch || '').toLowerCase();
  try {
    await ensureSchema();
    const doerId = new URL(req.url).searchParams.get('doerId');
    let rows;
    if (doerId) {
      [rows] = await pool.query(
        `SELECT ${SELECT_COLS} FROM daily_tasks WHERE doer_id = ? ORDER BY entry_date DESC, created_at DESC`,
        [doerId]);
    } else {
      [rows] = await pool.query(
        `SELECT ${SELECT_COLS} FROM daily_tasks ORDER BY entry_date DESC, created_at DESC`);
    }
    // Branch scoping in JS, not SQL: rows written before the branch column
    // existed (all Sheets-mode rows until now) have a blank branch, and a SQL
    // equality filter made every one of them vanish from "My Past Submissions".
    // Blank-branch rows stay visible to everyone.
    if (callerBranch) {
      rows = rows.filter((r) => {
        const b = String(r.branch || '').toLowerCase();
        return !b || b === callerBranch;
      });
    }
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
  const gate = await requireUser(); if (gate) return gate;
  const sessionUser = await currentUser();
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!body.entryDate || rows.length === 0)
      return NextResponse.json({ error: 'entryDate and at least one row required' }, { status: 400 });

    // Whose report this is comes from the session, not the request body. The
    // client used to name the doer, so anyone could file a day's work — or a
    // day of no work — under a colleague's name, and the daily WhatsApp report
    // reads straight off this table.
    // An admin may still file on someone else's behalf, explicitly.
    let doerId = sessionUser.id;
    let doerName = sessionUser.name || '';
    if (isAdminRoles(sessionUser.roles) && body.doerId && String(body.doerId) !== String(sessionUser.id)) {
      const [target] = await pool.query('SELECT id, name FROM users WHERE id = ?', [String(body.doerId)]);
      if (!target.length) return NextResponse.json({ error: 'Unknown doer' }, { status: 400 });
      doerId = target[0].id;
      doerName = target[0].name;
    }

    // First submission of the day for this doer? (mirrors Apps Script isFirstSubmission)
    const [existing] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM daily_tasks WHERE doer = ? AND entry_date = ?',
      [doerName, body.entryDate]
    );
    const firstToday = Number(existing[0]?.cnt || 0) === 0;

// Collision-proof id (lib/ids.js). The old 'COUNT(*) + 1' scheme re-used a
// live id the moment any row had ever been deleted, and two concurrent
// inserts read the same count — both land as a duplicate-primary-key 500.
    // Worse here than elsewhere: the ids were pre-computed from one count and
    // handed out down a loop with no transaction, so a collision partway
    // through left the day's submission half-written.
    for (const r of rows) {
      const id = newId('DT');
      const preInstallImage = await maybeUploadToDrive(r.preInstallImage, 'pre-install-photo');
      await pool.query(
        `INSERT INTO daily_tasks
           (id, entry_date, doer_id, doer, client, client_number, department, description, minutes,
            order_number, area_name, task_type, software, revision,
            site_location, purpose_of_visit, checks_type, kms_travelled,
            branch, pre_install_image, pre_install_comment,
            arc_name, arc_phone, old_new_client, no_of_visits, remarks,
            order_value, adv_paid, balance, mode_of_pay, executive,
            till_date_received, balance_target)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, body.entryDate, doerId || null, doerName,
         r.client || '', r.clientNumber || '', r.department || '', r.description || '', Number(r.minutes) || 0,
         r.orderNumber || '', r.areaName || '', r.taskType || '', r.software || '',
         r.revision === 'Yes' || r.revision === true ? 'Yes' : 'No',
         r.siteLocation || '', r.purposeOfVisit || '', r.checksType || '',
         Number(r.kmsTravelled) || 0,
         r.branch || 'Bangalore', preInstallImage || null, r.preInstallComment || null,
         r.arcName || '', r.arcPhone || '', r.oldNewClient || '', Number(r.noOfVisits) || 0, r.remarks || null,
         Number(r.orderValue) || 0, Number(r.advPaid) || 0, Number(r.balance) || 0,
         r.modeOfPay || '', r.executive || '',
         Number(r.tillDateReceived) || 0, Number(r.balanceTarget) || 0]
      );
    }

    if (firstToday) {
      await notifyFirstSubmission({ doerId, doer: doerName, entryDate: body.entryDate });
    }

    return NextResponse.json({ success: true, inserted: rows.length }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

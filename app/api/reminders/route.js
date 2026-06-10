import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { sendWhatsApp, reminderMessage, isWhatsappConfigured } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

// Allowed if called by Vercel Cron (Authorization: Bearer CRON_SECRET) or
// manually with ?secret=<DEVELOPER_SECRET> for testing.
function authorized(req) {
  const bearer = req.headers.get('authorization');
  if (process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return true;
  const secret = new URL(req.url).searchParams.get('secret');
  if (secret && secret === process.env.DEVELOPER_SECRET) return true;
  return false;
}

// Send a WhatsApp reminder for every OVERDUE, not-yet-done delegation
// (one message per task) to the doer's phone. Wired to a daily Vercel Cron.
export async function GET(req) {
  if (!authorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isWhatsappConfigured())
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });

  await ensureSchema();
  const [dels]  = await pool.query("SELECT * FROM delegations WHERE status != 'done' AND due_date < CURDATE()");
  const [users] = await pool.query('SELECT id, name, phone FROM users');
  const byId = {};
  users.forEach((u) => { byId[u.id] = u; });

  const results = [];
  for (const d of dels) {
    if (!d.due_date) continue;                 // guard: skip rows with no due date
    const u = byId[d.doer_id];
    const phone = u?.phone;
    if (!phone) { results.push({ id: d.id, skipped: 'no phone' }); continue; }
    const msg = reminderMessage({
      name: u?.name || d.doer,
      id: d.id,
      description: d.description,
      dueDate: d.due_date,
      priority: d.priority,
      client: d.client,
    });
    const r = await sendWhatsApp(phone, msg);
    results.push({ id: d.id, to: phone, ok: !!r.ok, reason: r.reason || r.error });
  }

  return NextResponse.json({
    overdue: dels.length,
    sent: results.filter((r) => r.ok).length,
    results,
  });
}

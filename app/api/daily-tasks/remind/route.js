import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/api';
import { sendWhatsApp, isWhatsappConfigured } from '@/lib/whatsapp';

// Departments that receive daily-task fill reminders
const REMINDER_DEPTS = [
  'sales', 'sales person',
  'crm', 'client relationship manager',
  'designer', 'design',
  'sc', 'site engineer', 'process coordinator',
  'runner',
];

function shouldRemind(dept) {
  return REMINDER_DEPTS.some((d) => (dept || '').toLowerCase().includes(d));
}

function reminderMessage(name) {
  const first = (name || 'there').split(' ')[0];
  return [
    `Hi ${first}! 👋`,
    '',
    'Please fill your *Daily Task Form* for today so we can track your work accurately.',
    '',
    '🔗 celestileoffice.com/daily-task',
    '',
    '— Team Celestile',
  ].join('\n');
}

export async function POST(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    await ensureSchema();
    const today = new Date().toISOString().slice(0, 10);

    // Who has already filled today?
    const [filled] = await pool.query(
      'SELECT DISTINCT doer FROM daily_tasks WHERE DATE(entry_date) = ?',
      [today]
    );
    const filledSet = new Set((filled || []).map((r) => (r.doer || '').toLowerCase()));

    // All active users with their phones and departments
    const [allUsers] = await pool.query(
      'SELECT id, name, phone, department FROM users'
    );

    // Target: relevant department AND hasn't filled today
    const targets = (allUsers || []).filter((u) =>
      shouldRemind(u.department) && !filledSet.has((u.name || '').toLowerCase())
    );

    if (!isWhatsappConfigured()) {
      return NextResponse.json({
        ok: false,
        error: 'WhatsApp not configured',
        targets: targets.map((u) => ({ name: u.name, department: u.department, hasPhone: !!u.phone })),
      });
    }

    const results = [];
    for (const u of targets) {
      if (!u.phone) {
        results.push({ name: u.name, department: u.department, status: 'no_phone' });
        continue;
      }
      try {
        await sendWhatsApp(u.phone, reminderMessage(u.name));
        results.push({ name: u.name, department: u.department, status: 'sent' });
      } catch (e) {
        results.push({ name: u.name, department: u.department, status: 'failed', error: e.message });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

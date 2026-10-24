import { sendEaReport, eaReportSentToday } from '@/lib/eaReport';
import { istDay } from '@/lib/dailyReport';
import { sendDelayAlerts, delayAlertsSentToday, markDelayAlertsSent } from '@/lib/delayAlerts';
import { isWhatsappConfigured } from '@/lib/whatsapp';

// In-app scheduler. The team reports are fired by an external cron hitting
// /api/reminders/daily-reports; the Walk-in + Payments (EA) report needed a
// second cron at 7 PM that never got set up on the host, so it simply never
// went out. This runs it from inside the server instead — nothing to
// configure on the host beyond starting the app.
//
// Started once per process from instrumentation.js. PM2 runs two cluster
// instances; only NODE_APP_INSTANCE 0 schedules (a lone process has no such
// env and schedules too). The "sent today" marker in app_config is a second
// guard so a restart in the send window cannot send it twice.
//
// Jobs (IST, Mon–Sat):
//   EA report     — EA_REPORT_TIME=HH:MM (default 19:00); EA_REPORT_SCHEDULE=off
//                   disables it in favour of an external cron.
//   Step alerts   — DELAY_ALERT_TIME=HH:MM (default 10:00); DELAY_ALERT_SCHEDULE=off
//                   disables it. Late items + pending lists per FMS step → their groups (lib/delayAlerts.js).

const TICK_MS = 30 * 1000;

function istMins() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

const off = (env) => String(process.env[env] || '').toLowerCase() === 'off';
const timeOf = (env, dflt) => (/^\d{2}:\d{2}$/.test(process.env[env] || '') ? process.env[env] : dflt);

// Fire from the target minute onward, up to an hour late, retrying every
// tick until it succeeds — the sent-today marker keeps that from doubling
// up once it does. A ~90-second window (target minute + the one after)
// used to mean a short WhatsApp/API outage right at send time dropped the
// report for the whole day with nothing left to retry it.
function dailyJob(name, target, sentToday, run) {
  let busy = false;
  const [h, m] = target.split(':').map(Number);
  return async () => {
    if (busy) return;
    let delta = istMins() - (h * 60 + m);
    if (delta < 0) delta += 24 * 60; // past midnight relative to target
    if (delta > 60) return;
    if (istDay() === 0) return;
    busy = true;
    try {
      if (await sentToday()) return;
      const r = await run();
      console.log(`[scheduler] ${name}`, JSON.stringify(r));
    } catch (e) {
      console.error(`[scheduler] ${name} failed:`, e.message);
    } finally {
      busy = false;
    }
  };
}

export function startScheduler() {
  const g = globalThis;
  if (g.__celestileScheduler) return;
  const inst = process.env.NODE_APP_INSTANCE;
  if (inst !== undefined && String(inst) !== '0') return;

  const jobs = [];
  if (!off('EA_REPORT_SCHEDULE')) {
    const t = timeOf('EA_REPORT_TIME', '19:00');
    jobs.push(dailyJob('EA report', t, eaReportSentToday, sendEaReport));
    console.log(`[scheduler] EA report armed for ${t} IST (Mon–Sat)`);
  }
  if (!off('DELAY_ALERT_SCHEDULE')) {
    const t = timeOf('DELAY_ALERT_TIME', '10:00');
    // Marked sent unless a group's send failed (then the next tick retries).
    // Nothing configured / nothing overdue / WhatsApp not set up all count as
    // done — retrying those for the hour would only re-read every sheet.
    jobs.push(dailyJob('Delay alerts', t, delayAlertsSentToday, async () => {
      const r = await sendDelayAlerts();
      if (!isWhatsappConfigured() || r.groups.every((x) => x.sent)) await markDelayAlertsSent();
      return r;
    }));
    console.log(`[scheduler] Delay alerts armed for ${t} IST (Mon–Sat)`);
  }
  if (!jobs.length) return;

  g.__celestileScheduler = setInterval(() => { jobs.forEach((j) => j()); }, TICK_MS);
  // Never keep the process alive just for this timer.
  if (typeof g.__celestileScheduler.unref === 'function') g.__celestileScheduler.unref();
}

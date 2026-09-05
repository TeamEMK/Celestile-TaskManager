import { sendEaReport, eaReportSentToday } from '@/lib/eaReport';
import { istDay } from '@/lib/dailyReport';

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
// EA_REPORT_TIME=HH:MM (IST, 24h) overrides the 7 PM default;
// EA_REPORT_SCHEDULE=off disables this in favour of an external cron.

const TICK_MS = 30 * 1000;

function istHHMM() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function startScheduler() {
  const g = globalThis;
  if (g.__celestileScheduler) return;
  if (String(process.env.EA_REPORT_SCHEDULE || '').toLowerCase() === 'off') return;
  const inst = process.env.NODE_APP_INSTANCE;
  if (inst !== undefined && String(inst) !== '0') return;

  const target = /^\d{2}:\d{2}$/.test(process.env.EA_REPORT_TIME || '') ? process.env.EA_REPORT_TIME : '19:00';
  let busy = false;

  const tick = async () => {
    if (busy) return;
    // Fire during the target minute and the one after it, in case a tick
    // lands late; the sent-today marker keeps that from doubling up.
    const now = istHHMM();
    const [h, m] = target.split(':').map(Number);
    const next = `${String(m === 59 ? (h + 1) % 24 : h).padStart(2, '0')}:${String((m + 1) % 60).padStart(2, '0')}`;
    if (now !== target && now !== next) return;
    if (istDay() === 0) return;
    busy = true;
    try {
      if (await eaReportSentToday()) return;
      const r = await sendEaReport();
      console.log('[scheduler] EA report', JSON.stringify(r));
    } catch (e) {
      console.error('[scheduler] EA report failed:', e.message);
    } finally {
      busy = false;
    }
  };

  g.__celestileScheduler = setInterval(() => { tick(); }, TICK_MS);
  // Never keep the process alive just for this timer.
  if (typeof g.__celestileScheduler.unref === 'function') g.__celestileScheduler.unref();
  console.log(`[scheduler] EA report armed for ${target} IST (Mon–Sat)`);
}

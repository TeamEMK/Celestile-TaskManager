import { sendEaReport, eaReportSentToday } from '@/lib/eaReport';
import { istDay, sendAllDailyReports, dailyReportsSentToday } from '@/lib/dailyReport';
import { sendDelayAlerts, delayAlertsSentToday, markDelayAlertsSent } from '@/lib/delayAlerts';
import { isWhatsappConfigured } from '@/lib/whatsapp';
import { sendAttendanceAlert, attendanceAlertSentToday } from '@/lib/attendanceAlert';

// In-app scheduler. The EA report and the team daily reports used to wait on
// cron jobs on the host that never got set up, so they simply never went
// out. This runs them from inside the server instead — nothing to configure
// on the host beyond starting the app.
//
// Started once per process from instrumentation.js. PM2 runs two cluster
// instances; only NODE_APP_INSTANCE 0 schedules (a lone process has no such
// env and schedules too). The "sent today" marker in app_config is a second
// guard so a restart in the send window cannot send it twice.
//
// Jobs (IST, Mon–Sat):
//   EA report     — EA_REPORT_TIME=HH:MM (default 19:00); EA_REPORT_SCHEDULE=off
//                   disables it in favour of an external cron.
//   Team reports  — DAILY_REPORT_TIME=HH:MM (default 21:30); DAILY_REPORT_SCHEDULE=off
//                   disables it. Design / sales / site reports → their groups.
//   Step alerts   — DELAY_ALERT_TIME=HH:MM (default 10:00); DELAY_ALERT_SCHEDULE=off
//                   disables it. Late items + pending lists per FMS step → their groups (lib/delayAlerts.js).
//   Attendance    — ATTENDANCE_ALERT_TIME=HH:MM (default 12:00); ATTENDANCE_ALERT_SCHEDULE=off
//                   disables it. Factory Attendance departments not filled → "Factory Attendance" group.

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
  if (!off('DAILY_REPORT_SCHEDULE')) {
    const t = timeOf('DAILY_REPORT_TIME', '21:30');
    jobs.push(dailyJob('Team daily reports', t, dailyReportsSentToday, sendAllDailyReports));
    console.log(`[scheduler] Team daily reports armed for ${t} IST (Mon–Sat)`);
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
  if (!off('ATTENDANCE_ALERT_SCHEDULE')) {
    const t = timeOf('ATTENDANCE_ALERT_TIME', '12:00');
    jobs.push(dailyJob('Attendance alert', t, attendanceAlertSentToday, sendAttendanceAlert));
    console.log(`[scheduler] Attendance alert armed for ${t} IST (Mon–Sat)`);
  }
  if (!off('DELEGATION_REMINDER_SCHEDULE')) {
    const t = timeOf('DELEGATION_REMINDER_TIME', '10:30');
    // Each doer's open delegations due today / overdue, to their own
    // WhatsApp (lib/delegationReminders.js). Marked sent before sending, so
    // a failure part-way never repeats the messages already gone out.
    jobs.push(dailyJob('Delegation reminders', t, async () => {
      const { delegationRemindersSentToday } = await import('@/lib/delegationReminders');
      return delegationRemindersSentToday();
    }, async () => {
      const { sendDelegationReminders, markDelegationRemindersSent } = await import('@/lib/delegationReminders');
      await markDelegationRemindersSent();
      return sendDelegationReminders();
    }));
    console.log(`[scheduler] Delegation reminders armed for ${t} IST (Mon–Sat)`);
  }
  if (!off('ENQUIRY_DIGEST_SCHEDULE')) {
    const t = timeOf('ENQUIRY_DIGEST_TIME', '09:30');
    // Each sales person's Enquiry tasks for the day, to their own WhatsApp
    // (lib/enquiryAlerts.js). Marked sent once it ran, whatever came of it.
    jobs.push(dailyJob('Enquiry sales digest', t, async () => {
      const { enquiryDigestSentToday } = await import('@/lib/enquiryAlerts');
      return enquiryDigestSentToday();
    }, async () => {
      const { sendEnquirySalesDigest, markEnquiryDigestSent } = await import('@/lib/enquiryAlerts');
      await markEnquiryDigestSent();
      return sendEnquirySalesDigest();
    }));
    console.log(`[scheduler] Enquiry sales digest armed for ${t} IST (Mon–Sat)`);
  }
  // One-time: Design O2D onto its new flow (lib/designFlowMigrate.js). It
  // writes a few hundred config cells, so a Sheets quota hit is retried a
  // few times; the switch resumes where it stopped.
  const designSwitch = (left) => {
    import('@/lib/designFlowMigrate')
      .then(({ migrateDesignFlow }) => migrateDesignFlow())
      .then((r) => console.log('[scheduler] Design flow switch', JSON.stringify(r)))
      // Then the CRM "Approved?" → "Revision?" switch (02-11-2026), which
      // needs the steps the flow switch lays out.
      .then(() => import('@/lib/designRevisionMigrate'))
      .then(({ migrateDesignRevision }) => migrateDesignRevision())
      .then((r) => console.log('[scheduler] Design CRM revision switch', JSON.stringify(r)))
      // Then Jibin's review Remarks only on a rejection (03-11-2026).
      .then(() => import('@/lib/designRemarksMigrate'))
      .then(({ migrateDesignReviewRemarks }) => migrateDesignReviewRemarks())
      .then((r) => console.log('[scheduler] Design review remarks', JSON.stringify(r)))
      .then(() => import('@/lib/designIntakeMigrate'))
      .then(({ migrateDesignIntakeStone }) => migrateDesignIntakeStone())
      .then((r) => console.log('[scheduler] Design New Entry stone fields', JSON.stringify(r)))
      // Then Step 4A Jointing Detail → the Blocking for Jointing page (04-11-2026).
      .then(() => import('@/lib/designJointingMigrate'))
      .then(({ migrateDesignJointingPage }) => migrateDesignJointingPage())
      .then((r) => console.log('[scheduler] Design jointing page', JSON.stringify(r)))
      .catch((e) => {
        console.error(`[scheduler] Design flow switch failed (${left} retries left):`, e.message);
        if (left > 0) setTimeout(() => designSwitch(left - 1), 2 * 60 * 1000);
      });
  };
  setTimeout(() => designSwitch(5), 15000);

  // One-time: Enquiry FMS steps back onto their sheet columns (17-11-2026).
  setTimeout(() => {
    import('@/lib/enquiryStepsMigrate')
      .then(({ migrateEnquirySteps }) => migrateEnquirySteps())
      .then((r) => console.log('[scheduler] Enquiry steps', JSON.stringify(r)))
      .then(() => import('@/lib/enquiryStepsMigrate'))
      .then(({ migrateEnquirySalesDropdown }) => migrateEnquirySalesDropdown())
      .then((r) => console.log('[scheduler] Enquiry sales dropdown', JSON.stringify(r)))
      .then(() => import('@/lib/enquiryStepsMigrate'))
      .then(({ migrateEnquiryStepsV3 }) => migrateEnquiryStepsV3())
      .then((r) => console.log('[scheduler] Enquiry steps v3', JSON.stringify(r)))
      .then(() => import('@/lib/enquiryStepsMigrate'))
      .then(({ migrateEnquiryQuotationUpload }) => migrateEnquiryQuotationUpload())
      .then((r) => console.log('[scheduler] Enquiry quotation upload', JSON.stringify(r)))
      .catch((e) => console.error('[scheduler] Enquiry steps failed:', e.message));
  }, 45000);

  // One-time: attachment links in the FMS sheets → links that open for
  // everyone (lib/driveLinksMigrate.js). Needs the production secret, so it
  // runs here rather than from a dev machine.
  setTimeout(() => {
    import('@/lib/driveLinksMigrate')
      .then(({ migrateDriveLinks }) => migrateDriveLinks())
      .then((r) => console.log('[scheduler] Drive links', JSON.stringify(r)))
      .catch((e) => console.error('[scheduler] Drive links failed:', e.message));
  }, 60000);

  if (!jobs.length) return;

  g.__celestileScheduler = setInterval(() => { jobs.forEach((j) => j()); }, TICK_MS);
  // Never keep the process alive just for this timer.
  if (typeof g.__celestileScheduler.unref === 'function') g.__celestileScheduler.unref();
}

// Next.js runs register() once per server process at startup. The only thing
// it starts is the in-app scheduler for the EA (Walk-in + Payments) WhatsApp
// report — see lib/scheduler.js. Node runtime only: the edge runtime has no
// timers worth keeping and no DB access.
//
// The dynamic import is nested INSIDE the runtime check (rather than guarded
// by an early return) so the bundler's dead-code elimination can see, at
// build time, that this branch is unreachable when compiling the edge
// runtime's copy of this file — and drop the import instead of trying to
// resolve lib/scheduler's dependency chain (which pulls in googleapis, and
// through it Node's http/https) for a runtime that doesn't have those
// modules. The early-return form doesn't get eliminated as reliably.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NEXT_PHASE === 'phase-production-build') return;
    const { startScheduler } = await import('@/lib/scheduler');
    startScheduler();
  }
}

// Next.js runs register() once per server process at startup. The only thing
// it starts is the in-app scheduler for the EA (Walk-in + Payments) WhatsApp
// report — see lib/scheduler.js. Node runtime only: the edge runtime has no
// timers worth keeping and no DB access.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startScheduler } = await import('@/lib/scheduler');
  startScheduler();
}

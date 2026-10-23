import { requireAdmin, json, fail } from '@/lib/api';
import { getDelayAlertConfig, saveDelayAlertConfig, sendDelayAlerts } from '@/lib/delayAlerts';
import { listAllFmsSteps } from '@/lib/fmsSheet';

// Delay-alert settings: which group each FMS step's overdue items go to.
// GET → { config: { [stepId]: spec }, flows: [{ fmsId, fmsName, steps }] }
export async function GET() {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const [config, flows] = await Promise.all([getDelayAlertConfig(), listAllFmsSteps()]);
    return json({ config, flows });
  } catch (err) { return fail(err.message, 500); }
}

export async function PUT(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { config } = await req.json();
    return json({ config: await saveDelayAlertConfig(config) });
  } catch (err) { return fail(err.message, 500); }
}

// "Send now" — the same digest the 10 AM job sends, on demand. Doesn't touch
// the daily sent-marker, so the scheduled run still goes out.
export async function POST() {
  const gate = await requireAdmin(); if (gate) return gate;
  try { return json(await sendDelayAlerts()); }
  catch (err) { return fail(err.message, 500); }
}

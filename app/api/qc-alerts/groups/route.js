import { requireAdmin, json, fail } from '@/lib/api';
import { getAlertGroups, saveAlertGroups } from '@/lib/qcAlerts';

// Named WhatsApp groups the O2D checklists alert ("Design", "SKM", …).
export async function GET() {
  const gate = await requireAdmin(); if (gate) return gate;
  try { return json(await getAlertGroups()); }
  catch (err) { return fail(err.message, 500); }
}

export async function PUT(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const { groups } = await req.json();
    for (const jid of Object.values(groups || {})) {
      const v = String(jid || '').trim();
      if (v && !/^[\d-]+@(g|c)\.us$/.test(v) && !/^\+?\d{10,15}$/.test(v)) {
        return fail(`"${v}" is not a WhatsApp group ID (…@g.us) or phone number`);
      }
    }
    return json(await saveAlertGroups(groups));
  } catch (err) { return fail(err.message, 500); }
}

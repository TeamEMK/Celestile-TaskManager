import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readStore, computeDashboard, computePerformance, computePendingApprovals } from '@/lib/store';
import { pool } from '@/lib/db';
import { getMyFmsPendingRows } from '@/lib/fmsSheet';
import { FMS_ENABLED } from '@/lib/config';
import DashboardClient from './DashboardClient';
import { isAdminRoles } from '@/lib/pages';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session       = await getServerSession(authOptions);
  const isAdmin       = isAdminRoles(session?.user?.roles);
  const currentUserId = session?.user?.id;
  const currentName   = session?.user?.name;

  // FMS pending-rows read (a separate, independent Google Sheets fetch) used
  // to run *after* this Promise.all resolved instead of alongside it, adding
  // its full latency serially to every dashboard load / 60s refresh.
  const [store, completions, fmsTasks] = await Promise.all([
    readStore(),
    pool.query('SELECT master_id FROM checklist_completions WHERE date = CURDATE()')
      .then(([rows]) => rows).catch(() => []),
    FMS_ENABLED
      ? getMyFmsPendingRows({ userId: currentUserId, userName: currentName, isAdmin, branch: session?.user?.branch, department: session?.user?.department }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const completedToday = new Set(completions.map((c) => c.master_id));

  const storeWithCompletions = {
    ...store,
    masters: (store.masters || []).filter((m) => !completedToday.has(m.id)),
  };

  const filteredStore = isAdmin ? storeWithCompletions : {
    ...storeWithCompletions,
    delegations: storeWithCompletions.delegations.filter((d) =>
      d.doerId === currentUserId ||
      d.doer === currentName
    ),
    masters:     storeWithCompletions.masters.filter((m) => m.assignedTo === currentName),
  };

  const data = computeDashboard(filteredStore);
  const to   = new Date();
  const from = new Date(); from.setDate(from.getDate() - 30);
  const performance = computePerformance(store, from.toISOString(), to.toISOString());
  const pendingApprovals = computePendingApprovals(store, { currentUserId });

  if (fmsTasks.length) {
    data.total   += fmsTasks.length;
    data.pending += fmsTasks.length;
  }
  // KPI totals above count every row; the rendered list is capped so the
  // page doesn't ship/render thousands of task cards (13k+ FMS pending rows
  // made the dashboard extremely heavy — huge RSC payload, huge DOM, and a
  // full re-fetch of all of it on every 60s auto-refresh). Sort delegations/
  // checklist + FMS together BEFORE capping — newest first, undated rows
  // last — so capping doesn't push whole FMS's off the list.
  const when = (t) => { const ms = new Date(t.createdAt || t.date || t.dueDate || '').getTime(); return Number.isNaN(ms) ? -Infinity : ms; };
  data.pendingTasks = [...data.pendingTasks, ...fmsTasks].sort((a, b) => when(b) - when(a)).slice(0, 50);

  return (
    <DashboardClient
      data={data}
      performance={performance}
      pendingApprovals={pendingApprovals}
      holidays={store.holidays || []}
      // Names/ids only — `picture` is an inline base64 blob per user and the
      // dashboard renders no avatars, so it only bloated the RSC payload.
      users={(store.users || []).map(({ picture, ...u }) => u)}
      isAdmin={isAdmin}
      userName={currentName || ''}
    />
  );
}

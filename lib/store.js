/**
 * Data store facade.
 *
 * All reads/writes go through lib/store-mysql.js, whose queries run on the
 * `pool` from lib/db.js — real MySQL when DB_HOST points at one, or the
 * Google-Sheets-backed SQL engine in Sheets mode. The old Postgres and
 * data/store.json fallbacks were unreachable in every deployed configuration
 * and were removed (Sept 2026 cleanup).
 *
 *   readStore()  -> { users, delegations, masters, holidays, profile, approvals }
 *   writeStore(data)
 */
import { readStoreDb, writeStoreDb } from './store-mysql.js';

export const DEPARTMENTS = [
  'CXO', 'Business Automation', 'Social Media', 'Graphic Designing',
  'Google Ads', 'SEO', 'Meta Ads', 'Content Writing', 'AI',
  'Website Design & Development', 'MDO', 'eMarketing Accounts'
];

export const ROLES = ['Admin', 'User', 'HOD'];

// Daily-task dropdowns (ported from the Apps Script "Dropdown" sheet:
// column A = Task Type, column B = Software). Edit these lists to match your
// team's workflow — the Daily Task form picks them up automatically.
export const TASK_TYPES = [
  '2D drawing', '3D drawing', 'render', 'jointing details', 'measurement file', 'program',
];

export const SOFTWARES = [
  '2D drawing', '3D drawing', 'render', 'jointing details', 'measurement file', 'program',
];

/* =====================================================================
   PUBLIC API
   ===================================================================== */

export async function readStore() {
  return readStoreDb();
}

export async function writeStore(data) {
  return writeStoreDb(data);
}

/* =====================================================================
   Pure helpers (used in pages, no IO)
   ===================================================================== */

export function computeDashboard(store, filter = 'all') {
  let total = 0, completed = 0, pending = 0, revised = 0;
  const items = [];
  const now = new Date();

  // Per-employee breakdown, so the admin dashboard's "employee" filter can
  // update the KPI cards, not just the pending-tasks list below them.
  const byDoer = {};
  const bump = (doer, key) => {
    if (!doer) return;
    if (!byDoer[doer]) byDoer[doer] = { total: 0, completed: 0, pending: 0, revised: 0, overdue: 0 };
    byDoer[doer][key]++;
  };

  if (filter === 'all' || filter === 'delegation') {
    (store.delegations || []).forEach((d) => {
      total++; bump(d.doer, 'total');
      const overdue = new Date(d.dueDate || d.due_date) < now;
      if (d.status === 'done') { completed++; bump(d.doer, 'completed'); }
      else {
        pending++; bump(d.doer, 'pending');
        if (overdue) bump(d.doer, 'overdue');
        if (d.status === 'revise' || d.status === 'revise_requested') { revised++; bump(d.doer, 'revised'); }
        items.push({
          id: d.id,
          doerId: d.doerId,
          type: 'Delegation',
          description: d.description,
          doer: d.doer,
          date: d.dueDate || d.due_date,
          client: d.client || '-',
          overdue,
          status: d.status || 'pending',
          priority: d.priority || 'Low',
          approval: d.approval || 'No Approval',
          approverId: d.approverId || null,
          approver: d.approver || '',
          url: d.url || '',
          remarks: d.remarks || '',
          image: d.image || '',
          attachment: d.attachment || '',
          requireFile: d.requireFile || d.require_file || 0,
          transferredBy:   d.transferredBy   || null,
          transferredFrom: d.transferredFrom || null,
          createdAt: d.createdAt || d.created_at,
        });
      }
    });
  }

  if (filter === 'all' || filter === 'checklist') {
    (store.masters || []).forEach((m) => {
      // Checklist masters are recurring task templates (no per-occurrence
      // status), so we surface each one as a pending item that's "due today".
      total++; pending++;
      bump(m.assignedTo, 'total'); bump(m.assignedTo, 'pending');
      items.push({
        id: m.id,
        doerId: m.doerId || null,
        type: 'Checklist',
        description: m.task,
        doer: m.assignedTo,
        date: now.toISOString(),
        client: '-',
        overdue: false,
        status: 'pending',
        attachment: m.attachment || '',
        requireFile: m.requireFile || m.require_file || 0,
        createdAt: m.createdAt || m.created_at,
      });
    });
  }

  return {
    total, completed, pending, revised, byDoer,
    pendingTasks: items.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)).slice(0, 50),
  };
}

// Tasks waiting on a chosen approver's sign-off (status = 'approval_pending'),
// org-wide (`total`, `byBranch` — keyed off the doer's user profile branch) plus the
// current user's own count as approver (`mine`), for the dashboard KPI card.
export function computePendingApprovals(store, { currentUserId } = {}) {
  const all = (store.delegations || []).filter((d) => d.status === 'approval_pending');
  const mine = currentUserId ? all.filter((d) => d.approverId === currentUserId).length : 0;

  const usersById = {};
  (store.users || []).forEach((u) => { usersById[u.id] = u; });

  const byBranch = { bangalore: 0, hyderabad: 0, factory: 0, unspecified: 0 };
  const byDoer = {};
  all.forEach((d) => {
    const b = (usersById[d.doerId]?.branch || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(byBranch, b)) byBranch[b]++;
    else byBranch.unspecified++;
    if (d.doer) byDoer[d.doer] = (byDoer[d.doer] || 0) + 1;
  });

  return { total: all.length, mine, byBranch, byDoer };
}

export function computePerformance(store, fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  to.setHours(23, 59, 59);

  const stats = {};
  (store.users || []).forEach((u) => {
    stats[u.name] = { name: u.name, completed: 0, total: 0, pending: 0 };
  });

  (store.delegations || []).forEach((d) => {
    const date = new Date(d.createdAt);
    if (date >= from && date <= to && stats[d.doer]) {
      stats[d.doer].total++;
      if (d.status === 'done') stats[d.doer].completed++;
      else stats[d.doer].pending++;
    }
  });

  const arr = Object.values(stats).filter((s) => s.total > 0);
  arr.sort((a, b) => b.completed - a.completed);

  return {
    top5: arr.slice(0, 5),
    bottom5: [...arr].sort((a, b) => b.pending - a.pending).slice(0, 5),
    mostActive: [...arr].sort((a, b) => b.total - a.total).slice(0, 5),
  };
}
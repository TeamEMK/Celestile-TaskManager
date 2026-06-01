import ApprovalsClient from './ApprovalsClient';
import UserApprovalsClient from './UserApprovalsClient';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';
import { readStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const session = await getServerSession(authOptions);
  const roles   = session?.user?.roles || [];
  const rolesArr = Array.isArray(roles) ? roles : String(roles).split(',').map(r => r.trim());
  const isAdmin  = rolesArr.includes('Admin') || rolesArr.includes('HOD');
  const hasDB   = !!process.env.DB_HOST;

  // Non-admin users AND admin-as-doer: show own revise requests
  const userId = session?.user?.id;
  let myRequests = [];

  if (hasDB) {
    myRequests = userId
      ? await pool.query(
          `SELECT id, description, client, due_date AS dueDate,
                  created_at AS createdAt, remarks, revise_action AS reviseAction
           FROM delegations WHERE doer_id = ? AND revise_action IS NOT NULL
           ORDER BY created_at DESC`,
          [userId]
        ).then(([r]) => r).catch(() => [])
      : [];
  } else {
    const store = await readStore();
    myRequests = (store.delegations || [])
      .filter(d => d.doerId === userId && d.reviseAction != null)
      .map(d => ({ ...d, dueDate: d.dueDate, createdAt: d.createdAt }));
  }

  if (!isAdmin) {
    return <UserApprovalsClient myRequests={myRequests} />;
  }

  let reviseRequests = [], taskApprovals = [];

  if (hasDB) {
    [reviseRequests, taskApprovals] = await Promise.all([
      pool.query(
        `SELECT id, description, doer, remarks, due_date AS dueDate, created_at AS createdAt
         FROM delegations WHERE status = 'revise_requested' ORDER BY created_at DESC`
      ).then(([r]) => r).catch(() => []),
      pool.query(
        `SELECT id, description, doer, client, due_date AS dueDate,
                priority, approval, created_at AS createdAt
         FROM delegations WHERE approval = 'Approval Required' AND status = 'pending'
         ORDER BY created_at DESC`
      ).then(([r]) => r).catch(() => []),
    ]);
  } else {
    const store = await readStore();
    const dels = store.delegations || [];
    reviseRequests = dels
      .filter(d => d.status === 'revise_requested')
      .map(d => ({ id: d.id, description: d.description, doer: d.doer, remarks: d.remarks, createdAt: d.createdAt }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    taskApprovals = dels
      .filter(d => d.approval === 'Approval Required' && d.status === 'pending')
      .map(d => ({ id: d.id, description: d.description, doer: d.doer, client: d.client, dueDate: d.dueDate, priority: d.priority, approval: d.approval, createdAt: d.createdAt }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return <ApprovalsClient reviseRequests={reviseRequests} taskApprovals={taskApprovals} />;
}

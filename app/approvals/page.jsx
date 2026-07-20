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

  const userId = session?.user?.id;

  // Tasks THIS user is the chosen approver for (actionable — approve/reject),
  // and tasks THIS user submitted that are now waiting on someone else's
  // sign-off (read-only). Both apply regardless of admin/HOD role — only the
  // specific assigned approver can act on a task, admin or not.
  let myApprovals = [], myTaskApprovals = [], myReviseRequests = [];

  if (hasDB) {
    [myApprovals, myTaskApprovals, myReviseRequests] = await Promise.all([
      userId ? pool.query(
        `SELECT id, description, doer, client, due_date AS dueDate, priority, url, image, attachment,
                created_at AS createdAt
         FROM delegations WHERE approver_id = ? AND status = 'approval_pending'
         ORDER BY created_at DESC`,
        [userId]
      ).then(([r]) => r).catch(() => []) : Promise.resolve([]),
      userId ? pool.query(
        `SELECT id, description, due_date AS dueDate, created_at AS createdAt, priority, url, image, attachment, approver
         FROM delegations WHERE doer_id = ? AND status = 'approval_pending'
         ORDER BY created_at DESC`,
        [userId]
      ).then(([r]) => r).catch(() => []) : Promise.resolve([]),
      userId ? pool.query(
        `SELECT id, description, due_date AS dueDate, created_at AS createdAt,
                remarks, revise_action AS reviseAction
         FROM delegations WHERE doer_id = ? AND revise_action IS NOT NULL
         ORDER BY created_at DESC`,
        [userId]
      ).then(([r]) => r).catch(() => []) : Promise.resolve([]),
    ]);
  } else {
    const store = await readStore();
    const dels = store.delegations || [];
    myApprovals = dels
      .filter(d => d.approverId === userId && d.status === 'approval_pending')
      .map(d => ({ id: d.id, description: d.description, doer: d.doer, client: d.client, dueDate: d.dueDate, priority: d.priority, url: d.url, image: d.image, attachment: d.attachment, createdAt: d.createdAt }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    myTaskApprovals = dels
      .filter(d => d.doerId === userId && d.status === 'approval_pending')
      .map(d => ({ id: d.id, description: d.description, dueDate: d.dueDate, createdAt: d.createdAt, priority: d.priority, url: d.url, image: d.image, attachment: d.attachment, approver: d.approver }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    myReviseRequests = dels
      .filter(d => d.doerId === userId && d.reviseAction != null)
      .map(d => ({ id: d.id, description: d.description, dueDate: d.dueDate, createdAt: d.createdAt, remarks: d.remarks, reviseAction: d.reviseAction }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  if (!isAdmin) {
    return <UserApprovalsClient myReviseRequests={myReviseRequests} myTaskApprovals={myTaskApprovals} myApprovals={myApprovals} />;
  }

  let reviseRequests = [];

  if (hasDB) {
    reviseRequests = await pool.query(
      `SELECT id, description, doer, remarks, due_date AS dueDate, created_at AS createdAt
       FROM delegations WHERE status = 'revise_requested' ORDER BY created_at DESC`
    ).then(([r]) => r).catch(() => []);
  } else {
    const store = await readStore();
    const dels = store.delegations || [];
    reviseRequests = dels
      .filter(d => d.status === 'revise_requested')
      .map(d => ({ id: d.id, description: d.description, doer: d.doer, remarks: d.remarks, dueDate: d.dueDate, createdAt: d.createdAt }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return <ApprovalsClient reviseRequests={reviseRequests} taskApprovals={myApprovals} myTaskApprovals={myTaskApprovals} />;
}

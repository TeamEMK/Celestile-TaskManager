import ApprovalsClient from './ApprovalsClient';
import UserApprovalsClient from './UserApprovalsClient';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool, ensureSchema } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  await ensureSchema();
  const session = await getServerSession(authOptions);
  const roles   = session?.user?.roles || [];
  const isAdmin = Array.isArray(roles) ? roles.includes('Admin') : String(roles).includes('Admin');

  if (!isAdmin) {
    const userId = session?.user?.id;
    const [myRequests] = userId
      ? await pool.query(
          `SELECT id, description, client, due_date AS dueDate,
                  created_at AS createdAt, remarks, revise_action AS reviseAction
           FROM delegations WHERE doer_id = ? AND revise_action IS NOT NULL
           ORDER BY created_at DESC`,
          [userId]
        )
      : [[]];
    return <UserApprovalsClient myRequests={myRequests} />;
  }

  const [[reviseRequests], [taskApprovals]] = await Promise.all([
    pool.query(
      `SELECT id, description, doer, remarks, created_at AS createdAt
       FROM delegations WHERE status = 'revise_requested' ORDER BY created_at DESC`
    ),
    pool.query(
      `SELECT id, description, doer, client, due_date AS dueDate,
              priority, approval, created_at AS createdAt
       FROM delegations WHERE approval = 'Approval Required' AND status = 'approval_pending'
       ORDER BY created_at DESC`
    ),
  ]);

  return <ApprovalsClient reviseRequests={reviseRequests} taskApprovals={taskApprovals} />;
}

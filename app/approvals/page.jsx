import { neon } from '@neondatabase/serverless';
import ApprovalsClient from './ApprovalsClient';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL);

export default async function ApprovalsPage() {
  const [reviseRequests, taskApprovals, leaves] = await Promise.all([
    sql`
      SELECT id, description, doer, remarks, created_at AS "createdAt"
      FROM delegations WHERE status = 'revise_requested'
      ORDER BY created_at DESC`,

    sql`
      SELECT id, description, doer, client,
             due_date AS "dueDate", priority, approval,
             created_at AS "createdAt"
      FROM delegations
      WHERE approval = 'Approval Required' AND status = 'pending'
      ORDER BY created_at DESC`,

    sql`
      SELECT id, user_id AS "userId", user_name AS "userName",
             type, from_date AS "fromDate", to_date AS "toDate",
             reason, status, approver, created_at AS "createdAt"
      FROM leaves WHERE status = 'pending'
      ORDER BY created_at DESC`
      .catch(() => []),
  ]);

  return (
    <ApprovalsClient
      reviseRequests={reviseRequests}
      taskApprovals={taskApprovals}
      leaves={leaves}
    />
  );
}

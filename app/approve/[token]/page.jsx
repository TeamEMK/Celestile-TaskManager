import { pool, ensureSchema } from '@/lib/db';
import ApproveClient from './ApproveClient';

export const metadata = { title: 'Quotation Approval — Celestile' };

export default async function ApprovePage({ params }) {
  const { token } = await params;

  let quotation = null;
  let initError = null;

  try {
    await ensureSchema();
    const [rows] = await pool.query(
      `SELECT ref_no, branch, client_name, grand_total, status,
              created_by_name, approved_by, approved_at
       FROM quotations WHERE approval_token = ? LIMIT 1`,
      [token]
    );
    if (rows[0]) {
      const r = rows[0];
      quotation = {
        refNo: r.ref_no, branch: r.branch, clientName: r.client_name,
        grandTotal: r.grand_total, status: r.status,
        createdByName: r.created_by_name, approvedBy: r.approved_by, approvedAt: r.approved_at,
      };
    } else {
      initError = 'Invalid or expired link';
    }
  } catch (e) {
    initError = 'Failed to load quotation';
  }

  return <ApproveClient token={token} quotation={quotation} initError={initError} />;
}

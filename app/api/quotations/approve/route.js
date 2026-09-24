import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import {
  sendWhatsApp, sendWhatsAppDocument, quotationApprovedMessage, quotationRejectedMessage, isWhatsappConfigured,
} from '@/lib/whatsapp';

// A row whose approval_expires_at has passed reads as "not found" — same
// message as a bad token, so an expired link can't be distinguished from a
// wrong one by probing.
function isExpired(row) {
  return row.approval_expires_at && new Date(row.approval_expires_at) < new Date();
}

export async function GET(req) {
  try {
    await ensureSchema();
    const token = new URL(req.url).searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

    const [rows] = await pool.query(
      `SELECT ref_no, branch, client_name, grand_total, status,
              created_by_name, approved_by, approved_at, approval_expires_at
       FROM quotations WHERE approval_token = ? LIMIT 1`,
      [token]
    );
    if (!rows[0] || isExpired(rows[0])) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

    const r = rows[0];
    return NextResponse.json({
      refNo: r.ref_no, branch: r.branch, clientName: r.client_name,
      grandTotal: r.grand_total, status: r.status,
      createdByName: r.created_by_name, approvedBy: r.approved_by, approvedAt: r.approved_at,
    });
  } catch (err) {
    console.error('[quotations/approve GET]', err.message);
    return NextResponse.json({ error: 'Failed to load quotation' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await ensureSchema();
    const { token, action, approverName, reason } = await req.json();
    if (!token || !action) return NextResponse.json({ error: 'token and action required' }, { status: 400 });
    if (!['approved', 'rejected'].includes(action))
      return NextResponse.json({ error: 'invalid action' }, { status: 400 });

    const [rows] = await pool.query(
      `SELECT id, ref_no, branch, client_name, grand_total, status, created_by_id, approval_token, approval_expires_at
       FROM quotations WHERE approval_token = ? LIMIT 1`,
      [token]
    );
    if (!rows[0] || isExpired(rows[0])) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

    const q = rows[0];
    if (q.status !== 'pending')
      return NextResponse.json({ error: `Already ${q.status}` }, { status: 409 });

    const approvedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
    // Condition the UPDATE on status still being 'pending' rather than
    // trusting the SELECT above — two near-simultaneous POSTs with the same
    // token could otherwise both pass the pending check before either write
    // landed. affectedRows === 0 means someone else's request won the race.
    const [result] = await pool.query(
      "UPDATE quotations SET status = ?, approved_by = ?, approved_at = ? WHERE approval_token = ? AND status = 'pending'",
      [action, approverName || 'Unknown', approvedAt, token]
    );
    if (!result.affectedRows) return NextResponse.json({ error: 'Already decided' }, { status: 409 });

    // Notify creator via WhatsApp (text + PDF on approval)
    if (isWhatsappConfigured() && q.created_by_id) {
      try {
        const [users] = await pool.query('SELECT phone FROM users WHERE id = ? LIMIT 1', [q.created_by_id]);
        const phone = users[0]?.phone;
        if (phone) {
          const msg = action === 'approved'
            ? quotationApprovedMessage({ refNo: q.ref_no, clientName: q.client_name, approvedBy: approverName, grandTotal: q.grand_total })
            : quotationRejectedMessage({ refNo: q.ref_no, clientName: q.client_name, rejectedBy: approverName, reason });
          await sendWhatsApp(phone, msg);
          if (action === 'approved') {
            const baseUrl = process.env.NEXTAUTH_URL || 'https://celestileoffice.com';
            const pdfUrl = `${baseUrl}/api/quotations/pdf?token=${q.approval_token}`;
            await sendWhatsAppDocument(phone, pdfUrl, `Quotation-${q.ref_no}.pdf`,
              `✅ Approved Quotation - ${q.ref_no} | ${q.client_name || ''}`);
          }
        }
      } catch (e) { console.error('[approve notify creator]', e.message); }
    }

    return NextResponse.json({ success: true, action });
  } catch (err) {
    console.error('[quotations/approve POST]', err.message);
    return NextResponse.json({ error: 'Failed to record decision' }, { status: 500 });
  }
}

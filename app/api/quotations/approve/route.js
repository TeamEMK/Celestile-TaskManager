import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import {
  sendWhatsApp, quotationApprovedMessage, quotationRejectedMessage, isWhatsappConfigured,
} from '@/lib/whatsapp';

export async function GET(req) {
  try {
    await ensureSchema();
    const token = new URL(req.url).searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

    const [rows] = await pool.query(
      `SELECT ref_no, branch, client_name, grand_total, status,
              created_by_name, approved_by, approved_at
       FROM quotations WHERE approval_token = ? LIMIT 1`,
      [token]
    );
    if (!rows[0]) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

    const r = rows[0];
    return NextResponse.json({
      refNo: r.ref_no, branch: r.branch, clientName: r.client_name,
      grandTotal: r.grand_total, status: r.status,
      createdByName: r.created_by_name, approvedBy: r.approved_by, approvedAt: r.approved_at,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
      `SELECT id, ref_no, branch, client_name, grand_total, status, created_by_id
       FROM quotations WHERE approval_token = ? LIMIT 1`,
      [token]
    );
    if (!rows[0]) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

    const q = rows[0];
    if (q.status !== 'pending')
      return NextResponse.json({ error: `Already ${q.status}` }, { status: 409 });

    const approvedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
    await pool.query(
      'UPDATE quotations SET status = ?, approved_by = ?, approved_at = ? WHERE approval_token = ?',
      [action, approverName || 'Unknown', approvedAt, token]
    );

    // Notify creator via WhatsApp
    if (isWhatsappConfigured() && q.created_by_id) {
      try {
        const [users] = await pool.query('SELECT phone FROM users WHERE id = ? LIMIT 1', [q.created_by_id]);
        const phone = users[0]?.phone;
        if (phone) {
          const msg = action === 'approved'
            ? quotationApprovedMessage({ refNo: q.ref_no, clientName: q.client_name, approvedBy: approverName, grandTotal: q.grand_total })
            : quotationRejectedMessage({ refNo: q.ref_no, clientName: q.client_name, rejectedBy: approverName, reason });
          await sendWhatsApp(phone, msg);
        }
      } catch (e) { console.error('[approve notify creator]', e.message); }
    }

    return NextResponse.json({ success: true, action });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

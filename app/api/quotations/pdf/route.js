import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

// Public — no auth required (linked from WhatsApp messages).
export async function GET(req) {
  try {
    await ensureSchema();
    const token = new URL(req.url).searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

    const [rows] = await pool.query(
      'SELECT pdf, ref_no, client_name FROM quotations WHERE approval_token = ? LIMIT 1',
      [token]
    );
    const r = rows[0];
    if (!r || !r.pdf) return NextResponse.json({ error: 'PDF not available' }, { status: 404 });

    const refNo = String(r.ref_no || 'quotation').replace(/[^a-zA-Z0-9_-]/g, '-');
    const filename = `Quotation-${refNo}.html`;

    return new NextResponse(r.pdf, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

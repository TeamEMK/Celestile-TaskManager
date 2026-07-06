import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { generateQuotationPdf } from '@/lib/quotation-pdf';

// Public — no auth required (linked directly from WhatsApp messages).
export async function GET(req) {
  try {
    await ensureSchema();
    const token = new URL(req.url).searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

    const [rows] = await pool.query(
      `SELECT ref_no, branch, client_name, client_firm, client_contact, client_email,
              architect_name, architect, consultant, consultant_number,
              boutique, payment_terms, validity, lead_time, transport,
              billing_address, site_address, grand_total,
              discount_pct, design_fees, installation_charges, packing_charges,
              stone_items, fixing_items, totals_config
       FROM quotations WHERE approval_token = ? LIMIT 1`,
      [token]
    );
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const pdfBuffer = await generateQuotationPdf(rows[0]);
    const refNo = String(rows[0].ref_no || 'quotation').replace(/[^a-zA-Z0-9_-]/g, '-');

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Quotation-${refNo}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[quotation pdf]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

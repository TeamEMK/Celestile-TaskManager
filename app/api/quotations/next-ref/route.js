import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { normalizeBranch, nextRefNo } from '@/lib/quotation';

export async function GET(req) {
  try {
    await ensureSchema();
    const branch = normalizeBranch(new URL(req.url).searchParams.get('branch'));
    const [rows] = await pool.query('SELECT ref_no FROM quotations WHERE branch = ?', [branch]);
    const refs = (rows || []).map((r) => r.ref_no);
    return NextResponse.json({ refNo: nextRefNo(refs, branch) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

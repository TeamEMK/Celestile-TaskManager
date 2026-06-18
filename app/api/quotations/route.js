import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendWhatsApp, quotationRevisionMessage, isWhatsappConfigured } from '@/lib/whatsapp';
import { normalizeBranch, isRevision, baseRef, buildChangeList } from '@/lib/quotation';
import { requireUser } from '@/lib/api';

// Per-branch WhatsApp recipient (ported from getBranchNotifyNumber). Configurable
// via env; falls back to the numbers from the Apps Script.
function branchNotifyNumber(branch) {
  const b = normalizeBranch(branch);
  if (b === 'hyderabad') return (process.env.QUOTATION_NOTIFY_HYD || '918008002121');
  return (process.env.QUOTATION_NOTIFY_BNG || '918050005533');
}

const parseJson = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

// snake_case DB row → camelCase API object (both `contact`/`clientContact` and
// `email`/`clientEmail` returned for frontend convenience).
function rowToQuo(r) {
  if (!r) return null;
  return {
    refNo: r.ref_no || '', branch: r.branch || 'bangalore',
    clientName: r.client_name || '', clientFirm: r.client_firm || '',
    clientContact: r.client_contact || '', contact: r.client_contact || '',
    clientEmail: r.client_email || '', email: r.client_email || '', pan: r.pan || '',
    architectName: r.architect_name || '', architectFirm: r.architect_firm || '', architect: r.architect || '',
    consultant: r.consultant || '', consultantNumber: r.consultant_number || '',
    consultantNo: r.consultant_number || '', consultantEmail: r.consultant_email || '',
    boutique: r.boutique || '', paymentTerms: r.payment_terms || '', validity: r.validity || '',
    leadTime: r.lead_time || '', transport: r.transport || '',
    billingAddress: r.billing_address || '', siteAddress: r.site_address || '',
    grandTotal: r.grand_total || '', discountPct: r.discount_pct || '',
    designFees: r.design_fees || '', installationCharges: r.installation_charges || '',
    packingCharges: r.packing_charges || '',
    stoneItems: parseJson(r.stone_items), totalsConfig: parseJson(r.totals_config),
    fixingItems: parseJson(r.fixing_items), pdf: r.pdf || '',
    createdAt: r.created_at || '',
  };
}

async function loadBranchRows(branch) {
  // branch falsy / "all" → every branch (admin panel); else just that branch
  const [rows] = (!branch || branch === 'all')
    ? await pool.query('SELECT * FROM quotations')
    : await pool.query('SELECT * FROM quotations WHERE branch = ?', [normalizeBranch(branch)]);
  // newest last by created_at (string-sortable ISO); keep stable for same-ts
  return rows.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const url = new URL(req.url);
    const branchParam = url.searchParams.get('branch');
    const ref = url.searchParams.get('ref');
    const full = url.searchParams.get('full');

    if (full) {
      // admin panel: full quotation objects, newest first (all branches if no branch)
      const rows = await loadBranchRows(branchParam);
      return NextResponse.json({ quotations: rows.map(rowToQuo).reverse() });
    }

    const rows = await loadBranchRows(normalizeBranch(branchParam));
    if (ref) {
      const match = rows.filter((r) => String(r.ref_no).trim() === String(ref).trim()).pop();
      if (!match) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
      return NextResponse.json(rowToQuo(match));
    }

    // default: list of ref numbers, newest first
    const refs = rows.map((r) => String(r.ref_no || '').trim()).filter(Boolean).reverse();
    return NextResponse.json({ refs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Find the latest prior version of a revision (base ref or any -REVn), excluding
// the ref being saved. Mirrors getPreviousVersionRow.
function findPreviousVersion(rows, refNo) {
  const base = baseRef(refNo);
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = String(rows[i].ref_no || '').trim();
    if (r === String(refNo)) continue;
    if (r === base || r.indexOf(base + '-REV') === 0) return rows[i];
  }
  return null;
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const session = await getServerSession(authOptions);
    const data = await req.json();
    const branch = normalizeBranch(data.branch);
    if (!data.refNo) return NextResponse.json({ error: 'refNo required' }, { status: 400 });

    const rows = await loadBranchRows(branch);
    const prevRow = isRevision(data.refNo) ? findPreviousVersion(rows, data.refNo) : null;

    const id = 'Q' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const createdAt = new Date().toISOString();
    const contact = data.clientContact || data.contact || '';
    const cemail = data.clientEmail || data.email || '';

    await pool.query(
      `INSERT INTO quotations
        (id, ref_no, branch, client_name, client_firm, client_contact, client_email, pan,
         architect_name, architect_firm, architect, consultant, consultant_number, consultant_email,
         boutique, payment_terms, validity, lead_time, transport, billing_address, site_address,
         grand_total, discount_pct, design_fees, installation_charges, packing_charges,
         stone_items, totals_config, fixing_items, pdf, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, data.refNo, branch, data.clientName || '', data.clientFirm || '', contact, cemail, data.pan || '',
        data.architectName || '', data.architectFirm || '', data.architect || '', data.consultant || '',
        data.consultantNumber || data.consultantNo || '', data.consultantEmail || '',
        data.boutique || '', data.paymentTerms || '', data.validity || '', data.leadTime || '',
        data.transport || '', data.billingAddress || '', data.siteAddress || '',
        data.grandTotal || '', data.discountPct || '', data.designFees || '', data.installationCharges || '',
        data.packingCharges || '',
        JSON.stringify(data.stoneItems || []), JSON.stringify(data.totalsConfig || []),
        JSON.stringify(data.fixingItems || []), data.pdf || '', createdAt,
      ]
    );

    // Auto-save consultant (Hyderabad parity, but harmless for both branches)
    if (data.consultant && (data.consultantNumber || data.consultantNo || data.consultantEmail)) {
      try {
        await upsertConsultant(data.consultant, data.consultantNumber || data.consultantNo, data.consultantEmail);
      } catch (e) { console.error('[quotation auto-consultant]', e.message); }
    }

    // Revision → WhatsApp change-list (best-effort, text-only)
    if (isRevision(data.refNo) && isWhatsappConfigured()) {
      try {
        const prev = prevRow ? rowToQuo(prevRow) : null;
        const changes = prev ? buildChangeList(prev, data, branch) : ['• Previous version not found'];
        const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const msg = quotationRevisionMessage({
          branch, refNo: data.refNo, clientName: data.clientName,
          revisedBy: session?.user?.name || session?.user?.email || 'Unknown user',
          dateStr, changes, grandTotal: data.grandTotal,
        });
        await sendWhatsApp(branchNotifyNumber(branch), msg);
      } catch (e) { console.error('[quotation revision notify]', e.message); }
    }

    return NextResponse.json({ status: 'success', refNo: data.refNo, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}

// Shared consultant upsert (used here + by the consultants route).
export async function upsertConsultant(name, mobile, email) {
  name = String(name || '').trim();
  mobile = String(mobile || '').trim();
  email = String(email || '').trim();
  if (!name) return;
  const [existing] = await pool.query('SELECT name, mobile, email FROM consultants');
  const found = (existing || []).find((c) => String(c.name).trim().toLowerCase() === name.toLowerCase());
  if (found) {
    await pool.query('UPDATE consultants SET mobile = ?, email = ? WHERE name = ?',
      [mobile || found.mobile || '', email || found.email || '', found.name]);
  } else {
    await pool.query('INSERT INTO consultants (name, mobile, email) VALUES (?, ?, ?)', [name, mobile, email]);
  }
}

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { pool, ensureSchema } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendWhatsApp, sendWhatsAppDocument, quotationRevisionMessage, quotationApprovalRequestMessage, isWhatsappConfigured } from '@/lib/whatsapp';
import { normalizeBranch, isRevision, baseRef, buildChangeList } from '@/lib/quotation';
import { requireUser } from '@/lib/api';
import { maybeUploadToDrive } from '@/lib/googleDrive';
import { computeBangaloreCharges, computeHyderabadCharges } from '@/lib/quotation-pdf';

// The Grand Total is entirely client-computed (BangaloreForm.jsx /
// HyderabadForm.jsx) and used to be stored verbatim — a tampered or stale
// request could persist an arbitrary total that then flows unchanged into
// the WhatsApp approval flow and the customer-facing PDF. Recompute it
// server-side from the same submitted line items using the identical
// formulas the PDF renderer uses, and refuse to save if they disagree by
// more than a rounding cent. `grandTotal` arrives as a formatted display
// string ("₹ 1,23,456.00"), hence the strip-to-digits parse.
const parseMoney = (s) => parseFloat(String(s ?? '').replace(/[^0-9.]/g, '')) || 0;

function expectedGrandTotal(branch, data, stoneItems) {
  if (normalizeBranch(branch) === 'hyderabad') {
    const fixingItems = Array.isArray(data.fixingItems) ? data.fixingItems : [];
    const c = computeHyderabadCharges(stoneItems, fixingItems, {
      discount_pct: data.discountPct, design_fees: data.designFees,
      installation_charges: data.installationCharges, packing_charges: data.packingCharges,
    });
    return c.netStone + c.designFees + c.fixSum + c.packing + c.installation + c.totalGst;
  }
  const c = computeBangaloreCharges(stoneItems, Array.isArray(data.totalsConfig) ? data.totalsConfig : []);
  return c.subTotal + c.totalGst;
}

// Per-branch WhatsApp recipient (ported from getBranchNotifyNumber). Configurable
// via env; falls back to the numbers from the Apps Script.
function branchNotifyNumber(branch) {
  const b = normalizeBranch(branch);
  if (b === 'hyderabad') return (process.env.QUOTATION_NOTIFY_HYD || '918008002121');
  return (process.env.QUOTATION_NOTIFY_BNG || '918050005533');
}

const parseJson = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

// Generate a random 40-char hex approval token. This gates an unauthenticated,
// irreversible financial action (approve/reject a quotation, and fetching the
// priced customer PDF) — crypto.randomBytes, not Math.random(), which is not
// cryptographically secure.
function genToken() {
  return crypto.randomBytes(20).toString('hex');
}

// Return approver phone numbers from env vars (already configured in Hostinger).
function getApproverPhones(branch) {
  const b = normalizeBranch(branch);
  if (b === 'hyderabad') {
    return [process.env.QUOTATION_NOTIFY_HYD, process.env.QUOTATION_NOTIFY_HYD_2].filter(Boolean);
  }
  return [process.env.QUOTATION_NOTIFY_BNG].filter(Boolean);
}

// snake_case DB row → camelCase API object (both `contact`/`clientContact` and
// `email`/`clientEmail` returned for frontend convenience).
function rowToQuo(r) {
  if (!r) return null;
  return {
    refNo: r.ref_no || '', branch: r.branch || 'bangalore',
    quoteDate: r.quote_date || '',
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
    status: r.status || 'pending',
    createdByName: r.created_by_name || '',
    approvedBy: r.approved_by || '',
    approvedAt: r.approved_at || '',
    approvalToken: r.approval_token || '',
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

// Lightweight variant for callers that only need ref numbers (the ref-picker
// dropdown) — skips pulling the MEDIUMTEXT stone_items/totals_config/
// fixing_items blobs for every quotation ever saved just to read one field.
async function loadBranchRefs(branch) {
  const [rows] = (!branch || branch === 'all')
    ? await pool.query('SELECT ref_no, created_at FROM quotations')
    : await pool.query('SELECT ref_no, created_at FROM quotations WHERE branch = ?', [normalizeBranch(branch)]);
  return rows.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const { searchParams } = req.nextUrl;
    const branchParam = searchParams.get('branch');
    const ref = searchParams.get('ref');
    const full = searchParams.get('full');

    if (searchParams.get('list')) {
      // Admin panel table: only the columns it actually renders. `full=1`
      // shipped every stone_items/fixing_items/pdf blob for every quotation
      // ever saved — megabytes the table never read, re-pulled on each
      // window focus.
      const rows = await loadBranchRows(branchParam);
      return NextResponse.json({
        quotations: rows.map((r) => ({
          refNo: r.ref_no || '', branch: r.branch || 'bangalore',
          quoteDate: r.quote_date || '',
          clientName: r.client_name || '', clientFirm: r.client_firm || '',
          consultant: r.consultant || '', grandTotal: r.grand_total || '',
          status: r.status || 'pending', createdAt: r.created_at || '',
          createdByName: r.created_by_name || '',
          approvedBy: r.approved_by || '', approvedAt: r.approved_at || '',
          approvalToken: r.approval_token || '',
        })).reverse(),
      });
    }

    if (full) {
      // full quotation objects, newest first (all branches if no branch)
      const rows = await loadBranchRows(branchParam);
      return NextResponse.json({ quotations: rows.map(rowToQuo).reverse() });
    }

    if (ref) {
      // Single quotation lookup — go straight for the exact row instead of
      // pulling every quotation in the branch just to filter one out in JS.
      const [rows] = await pool.query(
        'SELECT * FROM quotations WHERE branch = ? AND ref_no = ? ORDER BY created_at ASC',
        [normalizeBranch(branchParam), String(ref).trim()]
      );
      const match = rows[rows.length - 1];
      if (!match) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
      return NextResponse.json(rowToQuo(match));
    }

    // default: list of ref numbers, newest first
    const rows = await loadBranchRefs(normalizeBranch(branchParam));
    const refs = rows.map((r) => String(r.ref_no || '').trim()).filter(Boolean).reverse();
    return NextResponse.json({ refs });
  } catch (err) {
    console.error('[quotations GET]', err.message);
    return NextResponse.json({ error: 'Failed to load quotations' }, { status: 500 });
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

    // Numeric fields stored as raw strings with no validation used to accept
    // negative or non-numeric values with no defense before they reached the
    // customer-facing PDF.
    for (const [key, label] of [
      ['discountPct', 'Discount %'], ['designFees', 'Design Fees'],
      ['installationCharges', 'Installation Charges'], ['packingCharges', 'Packing Charges'],
    ]) {
      if (data[key] === undefined || data[key] === null || data[key] === '') continue;
      const n = Number(data[key]);
      if (!Number.isFinite(n) || n < 0)
        return NextResponse.json({ error: `${label} must be a number ≥ 0` }, { status: 400 });
    }
    if (data.discountPct !== undefined && Number(data.discountPct) > 100)
      return NextResponse.json({ error: 'Discount % cannot exceed 100' }, { status: 400 });

    // Only look up prior versions for an actual revision save — a brand-new
    // quotation has none, so skip the (previously unconditional) SELECT * of
    // every quotation in the branch just to maybe find one prior row.
    let prevRow = null;
    if (isRevision(data.refNo)) {
      const base = baseRef(data.refNo);
      // No OR / LIKE in the Sheets SQL engine — match the ref family in JS.
      const [branchRows] = await pool.query('SELECT * FROM quotations WHERE branch = ?', [branch]);
      const candidates = branchRows
        .filter((r) => r.ref_no === base || String(r.ref_no || '').startsWith(`${base}-REV`))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      prevRow = findPreviousVersion(candidates, data.refNo);
    } else {
      // nextRefNo() (the /next-ref lookup the form calls to prefill this
      // field) is a read-then-compute with no uniqueness constraint behind
      // it — two quotations created around the same time in the same branch
      // could be assigned the identical ref_no, silently orphaning one of
      // them from ref-based lookup/revision diffing. Re-check right before
      // the insert to narrow that window as much as a check-then-act guard
      // can.
      const [dupe] = await pool.query('SELECT id FROM quotations WHERE branch = ? AND ref_no = ?', [branch, data.refNo]);
      if (dupe.length) {
        return NextResponse.json({
          status: 'error',
          message: `Ref number ${data.refNo} was just taken by another quotation. Please refresh and try again.`,
        }, { status: 409 });
      }
    }

    const id = 'Q' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const createdAt = new Date().toISOString();
    const contact = data.clientContact || data.contact || '';
    const cemail = data.clientEmail || data.email || '';
    const approvalToken = genToken();
    // 30 days, matching the "Quotation valid for 30 days" terms already
    // printed on the PDF — an approval/PDF link no longer works forever.
    const approvalExpiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const creatorId = session?.user?.id || null;
    const creatorName = session?.user?.name || session?.user?.email || 'Unknown';

    const stoneItems = Array.isArray(data.stoneItems) ? data.stoneItems : [];

    // Reject a Grand Total that doesn't foot to the submitted line items —
    // ₹1 tolerance covers rounding drift between the client's live display
    // format and this recomputation (see expectedGrandTotal above).
    const expected = expectedGrandTotal(branch, data, stoneItems);
    const submitted = parseMoney(data.grandTotal);
    if (Math.abs(expected - submitted) > 1) {
      return NextResponse.json({
        status: 'error',
        message: `Grand Total does not match the line items (expected ~₹${expected.toFixed(2)}). Please refresh and try again.`,
      }, { status: 400 });
    }

    // Uploads are independent — in parallel instead of one Drive round trip
    // per line item while the user waits on the save.
    await Promise.all(stoneItems.map(async (item) => {
      if (item?.img) item.img = await maybeUploadToDrive(item.img, 'quotation-item');
    }));

    await pool.query(
      `INSERT INTO quotations
        (id, ref_no, branch, client_name, client_firm, client_contact, client_email, pan,
         architect_name, architect_firm, architect, consultant, consultant_number, consultant_email,
         boutique, payment_terms, validity, lead_time, transport, billing_address, site_address,
         grand_total, discount_pct, design_fees, installation_charges, packing_charges,
         stone_items, totals_config, fixing_items, pdf, created_at,
         status, created_by_id, created_by_name, approval_token, quote_date, approval_expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, data.refNo, branch, data.clientName || '', data.clientFirm || '', contact, cemail, data.pan || '',
        data.architectName || '', data.architectFirm || '', data.architect || '', data.consultant || '',
        data.consultantNumber || data.consultantNo || '', data.consultantEmail || '',
        data.boutique || '', data.paymentTerms || '', data.validity || '', data.leadTime || '',
        data.transport || '', data.billingAddress || '', data.siteAddress || '',
        data.grandTotal || '', data.discountPct || '', data.designFees || '', data.installationCharges || '',
        data.packingCharges || '',
        JSON.stringify(stoneItems), JSON.stringify(data.totalsConfig || []),
        JSON.stringify(data.fixingItems || []), data.pdf || '', createdAt,
        'pending', creatorId, creatorName, approvalToken, data.quoteDate || '', approvalExpiresAt,
      ]
    );

    // Auto-save consultant (Hyderabad parity, but harmless for both branches)
    if (data.consultant && (data.consultantNumber || data.consultantNo || data.consultantEmail)) {
      try {
        await upsertConsultant(data.consultant, data.consultantNumber || data.consultantNo, data.consultantEmail);
      } catch (e) { console.error('[quotation auto-consultant]', e.message); }
    }

    // New quotation → WhatsApp approval request to branch approvers
    if (!isRevision(data.refNo) && isWhatsappConfigured()) {
      try {
        const baseUrl = process.env.NEXTAUTH_URL || 'https://celestileoffice.com';
        const approvalUrl = `${baseUrl}/approve/${approvalToken}`;
        const msg = quotationApprovalRequestMessage({
          branch, refNo: data.refNo, clientName: data.clientName,
          grandTotal: data.grandTotal, createdBy: creatorName, approvalUrl,
        });
        const phones = getApproverPhones(branch);
        const pdfUrl = `${baseUrl}/api/quotations/pdf?token=${approvalToken}`;
        const pdfFilename = `Quotation-${data.refNo}.pdf`;
        for (const phone of phones) {
          await sendWhatsApp(phone, msg);
          await sendWhatsAppDocument(phone, pdfUrl, pdfFilename, `📄 Quotation ${data.refNo} — ${data.clientName || ''}`);
        }
      } catch (e) { console.error('[quotation new notify]', e.message); }
    }

    // Revision → WhatsApp change-list + the updated PDF
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
        const notifyNumber = branchNotifyNumber(branch);
        await sendWhatsApp(notifyNumber, msg);
        const baseUrl = process.env.NEXTAUTH_URL || 'https://celestileoffice.com';
        const pdfUrl = `${baseUrl}/api/quotations/pdf?token=${approvalToken}`;
        const pdfFilename = `Quotation-${data.refNo}.pdf`;
        await sendWhatsAppDocument(notifyNumber, pdfUrl, pdfFilename, `📄 Revised Quotation ${data.refNo} — ${data.clientName || ''}`);
      } catch (e) { console.error('[quotation revision notify]', e.message); }
    }

    return NextResponse.json({ status: 'success', refNo: data.refNo, id }, { status: 201 });
  } catch (err) {
    console.error('[quotations POST]', err.message);
    return NextResponse.json({ status: 'error', message: 'Failed to save quotation' }, { status: 500 });
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

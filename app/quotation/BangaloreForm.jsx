'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CELESTILE_LOGO } from '@/lib/celestile-logo';
import { fileToThumbnail } from './imageThumb';
import { CalcInput } from './calcExpr';

/* ── constants (ported from IndexBng) ─────────────────────────────────── */
const MATERIAL_LIST = ['Marble','Granite','Quartzite','Limestone','Travertine','Onyx','Sandstone','Slate','Porcelain','Ceramic','Vitrified','Natural Stone','Engineered Stone'];
const UNIT_OPTIONS = ['Piece','Module','SFT','RFT','Set','Nos'];
const DEFAULT_GST = 18;
const PACKING_RATE = 160;
const INSTALLATION_RATE = 475;

const parseSize = (s) => {
  if (!s) return { wt: 0, ht: 0 };
  const p = String(s).split(/[x×*\s]+/i).filter(Boolean);
  return { wt: parseFloat(p[0]) || 0, ht: parseFloat(p[1]) || 0 };
};
const inr0 = (n) => '₹ ' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const inr2 = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Round a single dimension up to the nearest multiple of 6
const roundDim6 = (n) => Math.ceil((Number(n) || 0) / 6) * 6;
// SFT per module: round each dimension to nearest-6, then convert sq-inches → SFT
// e.g. 10×10 → 12×12 = 144 sq-in ÷ 144 = 1 SFT
const moduleQty = (wt, ht) => (roundDim6(wt) * roundDim6(ht)) / 144;

const blankRow = () => ({ desc:'', area:'', size:'', mat:'', thk:'', unit:'', module:false, price:'', qty:'', gst:DEFAULT_GST, img:'' });
const defaultTotals = () => ([
  { id:'basicSaleValue', label:'Basic Sale Value', type:'auto' },
  { id:'discount', label:'Discount', type:'manual-discount', value:0, mode:'percent' },
  { id:'packingCharges', label:'Packing Charges', type:'rate-area', rate:PACKING_RATE, area:0, value:0 },
  { id:'installationCharges', label:'Installation Charges', type:'rate-area', rate:INSTALLATION_RATE, area:0, value:0 },
  { id:'chemicalCharges', label:'Chemical Charges', type:'manual', value:0 },
  { id:'transportation', label:'Transportation & Unloading', type:'manual', value:0 },
  { id:'subTotal', label:'Sub Total', type:'calculated' },
  { id:'gst', label:'GST', type:'calculated' },
]);

const todayISO = () => new Date().toISOString().split('T')[0];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function validityFrom(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr); if (isNaN(d)) return '';
  d.setDate(d.getDate() + 30);
  return String(d.getDate()).padStart(2,'0') + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}
function nextRevRef(ref) {
  const m = String(ref || '').match(/^(.*?)(?:-REV(\d+))?$/i);
  const base = m[1]; const n = m[2] ? parseInt(m[2], 10) : 0;
  return base + '-REV' + (n + 1);
}

/* ── the exact totals math (mirrors updateTotals/computeRowGross) ──────── */
function compute(rows, totals) {
  const rowData = rows.map((r) => {
    const price = parseFloat(r.price) || 0;
    let qty;
    if (r.module) { const { wt, ht } = parseSize(r.size); qty = moduleQty(wt, ht); }
    else qty = parseFloat(r.qty) || 0;
    const gstPct = parseFloat(r.gst) || 0;
    return { gross: price * qty, gstPct, qty, hasInput: price > 0 || qty > 0 };
  });
  const basicSale = rowData.reduce((s, r) => s + r.gross, 0);

  let discountPct = 0, chargesSum = 0;
  const chargeVals = {};
  totals.forEach((rc) => {
    if (rc.type === 'manual-discount') discountPct = parseFloat(rc.value) || 0;
    else if (rc.type === 'manual') { const v = parseFloat(rc.value) || 0; chargeVals[rc.id] = v; chargesSum += v; }
    else if (rc.type === 'rate-area') { const v = (rc.rate || 0) * (parseFloat(rc.area) || 0); chargeVals[rc.id] = v; chargesSum += v; }
  });
  let discount = basicSale * discountPct / 100;
  if (discount > basicSale) discount = basicSale;

  let totalGst = 0, weightedGstNumer = 0;
  rowData.forEach((rd) => {
    const share = basicSale > 0 ? rd.gross / basicSale : 0;
    const taxable = rd.gross - discount * share;
    totalGst += taxable * (rd.gstPct / 100);
    weightedGstNumer += rd.gross * rd.gstPct;
  });
  const avgGst = basicSale > 0 ? weightedGstNumer / basicSale : DEFAULT_GST;
  totalGst += chargesSum * (avgGst / 100);

  const subTotal = (basicSale - discount) + chargesSum;
  const grandTotal = subTotal + totalGst;
  return { rowData, basicSale, discountPct, discount, chargesSum, chargeVals, totalGst, subTotal, grandTotal };
}

const HEADER_FIELDS = [
  ['clientName','Client Name','Enter client name'], ['architectName','Architect Name','Architect name'],
  ['architectFirm','Architect Firm','Firm / Company'], ['consultant','Consultant','—'],
  ['consultantNumber','Consultant Number','+91 …'], ['consultantEmail','Consultant Email','consultant@email.com'],
  ['clientContact','Client Contact','+91 …'], ['clientEmail','Email','email@example.com'],
  ['boutique','Boutique',''], ['leadTime','Lead Time',''],
];

export default function BangaloreForm({ initialRef = '' }) {
  const { data: session } = useSession();
  const roles = session?.user?.roles || [];
  const isAdmin = roles.includes('Admin') || roles.includes('HOD');

  const [header, setHeader] = useState({
    quoteDate: todayISO(), refNo: '', clientName:'', architectName:'', architectFirm:'',
    consultant:'', consultantNumber:'', consultantEmail:'', clientContact:'', clientEmail:'',
    boutique:'Sarjapur Road, Bangalore', validity:'', leadTime:'60 Working Days',
    billingAddress:'', siteAddress:'', status:'',
  });
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, blankRow));
  const [totals, setTotals] = useState(defaultTotals);
  const [reviseList, setReviseList] = useState([]);
  const [showRevise, setShowRevise] = useState(false);
  const [selRef, setSelRef] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [consultants, setConsultants] = useState([]);

  const setH = (k, v) => setHeader((h) => ({ ...h, [k]: v }));
  const calc = useMemo(() => compute(rows, totals), [rows, totals]);

  // initial: next ref + validity + consultant list
  useEffect(() => {
    fetch('/api/quotations/next-ref?branch=bangalore').then((r) => r.json())
      .then((d) => setHeader((h) => ({ ...h, refNo: d.refNo || '001' }))).catch(() => {});
    fetch('/api/consultants').then((r) => r.json())
      .then((d) => setConsultants(Array.isArray(d?.list) ? d.list : [])).catch(() => {});
    setHeader((h) => ({ ...h, validity: validityFrom(h.quoteDate) }));
    if (initialRef) loadRef(initialRef);
  }, []);

  /* row ops */
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const delRow = (i) => setRows((rs) => rs.length === 1 ? [blankRow()] : rs.filter((_, idx) => idx !== i));
  async function handleImg(i, file, inputEl) {
    if (!file) return;
    try { setRow(i, 'img', await fileToThumbnail(file)); } catch { /* ignore */ }
    try { if (inputEl) inputEl.value = ''; } catch { /* iOS Safari: file input .value = '' throws */ }
  }

  /* totals ops */
  const setTotal = (id, patch) => setTotals((ts) => ts.map((t) => t.id === id ? { ...t, ...patch } : t));
  const addCustom = () => setTotals((ts) => {
    const i = ts.findIndex((t) => t.id === 'subTotal');
    const row = { id: 'custom_' + Date.now().toString(36), label: 'Custom Charge', type: 'manual', value: 0 };
    if (i < 0) return [...ts, row];
    return [...ts.slice(0, i), row, ...ts.slice(i)];
  });
  const removeTotal = (id) => setTotals((ts) => ts.filter((t) => t.id !== id));

  /* consultant autofill on name match */
  function onConsultantBlur() {
    const c = consultants.find((x) => x.name.toLowerCase() === header.consultant.trim().toLowerCase());
    if (c) setHeader((h) => ({ ...h, consultantNumber: h.consultantNumber || c.mobile, consultantEmail: h.consultantEmail || c.email }));
  }

  /* save */
  async function save() {
    setSaving(true); setStatus('Saving…');
    const payload = {
      branch: 'bangalore', refNo: header.refNo, quoteDate: header.quoteDate,
      clientName: header.clientName, architectName: header.architectName, architectFirm: header.architectFirm,
      consultant: header.consultant, consultantNumber: header.consultantNumber, consultantEmail: header.consultantEmail,
      clientContact: header.clientContact, clientEmail: header.clientEmail, boutique: header.boutique,
      validity: header.validity, leadTime: header.leadTime, billingAddress: header.billingAddress, siteAddress: header.siteAddress,
      grandTotal: inr0(calc.grandTotal),
      stoneItems: rows.filter((r) => r.desc || r.area || Number(r.price) || Number(r.qty)),
      totalsConfig: totals,
    };
    try {
      const res = await fetch('/api/quotations', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const d = await res.json();
      if (!res.ok || d.status === 'error') throw new Error(d.message || 'Save failed');
      const isRev = String(header.refNo).toUpperCase().includes('-REV');
      setStatus('✅ Saved (' + d.refNo + ')' + (isRev ? '' : ' — Approval WhatsApp sent'));
      setH('status', 'pending');
      // refresh next ref for a fresh new quotation number
      fetch('/api/quotations/next-ref?branch=bangalore').then((r) => r.json()).then((x) => x.refNo).catch(() => {});
    } catch (e) { setStatus('❌ ' + e.message); }
    finally { setSaving(false); }
  }

  /* revise: load list, then load one */
  async function openRevise() {
    setStatus('');
    try {
      const d = await (await fetch('/api/quotations?branch=bangalore')).json();
      setReviseList(Array.isArray(d.refs) ? d.refs : []);
      setSelRef((d.refs || [])[0] || '');
      setShowRevise(true);
    } catch { setStatus('❌ Could not load list'); }
  }
  const loadSelected = () => loadRef(selRef);
  async function loadRef(ref) {
    if (!ref) return;
    setShowRevise(false); setStatus('Loading…');
    try {
      const q = await (await fetch('/api/quotations?branch=bangalore&ref=' + encodeURIComponent(ref))).json();
      if (q.error) throw new Error(q.error);
      setHeader((h) => ({
        ...h,
        refNo: nextRevRef(q.refNo), clientName: q.clientName || '', architectName: q.architectName || '',
        architectFirm: q.architectFirm || '', consultant: q.consultant || '', consultantNumber: q.consultantNumber || '',
        consultantEmail: q.consultantEmail || '', clientContact: q.clientContact || q.contact || '',
        clientEmail: q.clientEmail || q.email || '', boutique: q.boutique || h.boutique,
        validity: q.validity || h.validity, leadTime: q.leadTime || h.leadTime,
        billingAddress: q.billingAddress || '', siteAddress: q.siteAddress || '',
        status: '', // revising always starts a fresh draft that needs its own approval
      }));
      const items = Array.isArray(q.stoneItems) ? q.stoneItems : [];
      setRows(items.length ? items.map((it) => ({ ...blankRow(), ...it, module: !!it.module, gst: it.gst ?? DEFAULT_GST })) : [blankRow()]);
      setTotals(Array.isArray(q.totalsConfig) && q.totalsConfig.length ? q.totalsConfig : defaultTotals());
      setStatus('Loaded ' + q.refNo + ' → revising as ' + nextRevRef(q.refNo));
    } catch (e) { setStatus('❌ ' + e.message); }
  }

  function reset() {
    setHeader((h) => ({ ...h, clientName:'', architectName:'', architectFirm:'', consultant:'', consultantNumber:'',
      consultantEmail:'', clientContact:'', clientEmail:'', billingAddress:'', siteAddress:'',
      boutique:'Sarjapur Road, Bangalore', leadTime:'60 Working Days', quoteDate: todayISO(), validity: validityFrom(todayISO()), status:'' }));
    setRows(Array.from({ length: 5 }, blankRow));
    setTotals(defaultTotals());
    fetch('/api/quotations/next-ref?branch=bangalore').then((r) => r.json()).then((d) => setH('refNo', d.refNo || '001')).catch(() => {});
    setStatus('');
  }

  const canDownload = isAdmin || header.status === 'approved';
  function printPdf() {
    if (!canDownload) return;
    const html = buildPdfHtml(header, rows, totals, calc);
    const w = window.open('', '_blank');
    if (!w) { setStatus('❌ Popup blocked — allow popups to print.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 700);
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <datalist id="bq-mat">{MATERIAL_LIST.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="bq-unit">{UNIT_OPTIONS.map((u) => <option key={u} value={u} />)}</datalist>
      <datalist id="bq-consult">{consultants.map((c) => <option key={c.name} value={c.name} />)}</datalist>

      {/* toolbar */}
      <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <IconDoc className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-[15px] font-semibold tracking-tight text-slate-900">Quotation — Bangalore</div>
            <div className="text-[11.5px] text-slate-500">Ref: <b className="text-slate-700">{header.refNo || '—'}</b></div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {status && <span className="text-[12px] text-slate-600 mr-1">{status}</span>}
          <button className="btn-ghost" onClick={reset}>↺ Reset</button>
          <button className="btn-secondary" onClick={openRevise}>Revise</button>
          <button className="btn-secondary" disabled={!canDownload} title={canDownload ? '' : 'Available once an admin approves this quotation'} onClick={printPdf}>⬇ PDF</button>
          <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : '💾 Save'}</button>
        </div>
      </div>

      {/* header info */}
      <div className="card p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <IconInfo className="w-4 h-4" />
          </div>
          <h2 className="section-title">Client &amp; Project Details</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Date" type="date" value={header.quoteDate}
            onChange={(v) => setHeader((h) => ({ ...h, quoteDate: v, validity: validityFrom(v) }))} />
          {HEADER_FIELDS.map(([k, label, ph]) => (
            <Field key={k} label={label} value={header[k]} placeholder={ph}
              list={k === 'consultant' ? 'bq-consult' : undefined}
              onBlur={k === 'consultant' ? onConsultantBlur : undefined}
              onChange={(v) => setH(k, v)} />
          ))}
          <Field label="Validity" value={header.validity} readOnly />
          <Field label="Site Address" value={header.siteAddress} onChange={(v) => setH('siteAddress', v)} />
          <Field label="Billing Address" value={header.billingAddress} onChange={(v) => setH('billingAddress', v)} />
        </div>
      </div>

      {/* selections table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 bg-gradient-to-r from-slate-50/80 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconList /></div>
            <div>
              <h2 className="text-[13.5px] font-semibold text-slate-900">Selections</h2>
              <p className="text-[11.5px] text-slate-500">{rows.length} line{rows.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                <tr>
                  {['#','Image','Description','Area','Size (in)','Material','Thickness','Unit','SFT','Rate ₹','Qty','GST %','Amount',''].map((h, i) =>
                    <th key={i} className={`table-th whitespace-nowrap ${i >= 9 && i <= 12 ? 'text-right' : ''}`}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const eff = calc.rowData[i] || { gross: 0, qty: 0, hasInput: false };
                  return (
                    <tr key={i} className="table-row">
                      <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                      <td className="px-1 py-1">
                        <label className="cursor-pointer flex items-center justify-center w-10 h-10 rounded-lg border border-dashed border-slate-300 overflow-hidden hover:border-primary-400 transition-colors">
                          {r.img ? <img src={r.img} alt="" className="w-10 h-10 object-cover" /> : <span className="text-slate-400 text-lg leading-none">+</span>}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImg(i, e.target.files[0], e.target)} />
                        </label>
                      </td>
                      <td className="px-1 py-1"><input className="input !py-1" value={r.desc} onChange={(e) => setRow(i, 'desc', e.target.value)} placeholder="Description" /></td>
                      <td className="px-1 py-1 w-16"><input className="input !py-1" value={r.area} onChange={(e) => setRow(i, 'area', e.target.value)} placeholder="—" /></td>
                      <td className="px-1 py-1 w-24"><input className="input !py-1" value={r.size} onChange={(e) => setRow(i, 'size', e.target.value)} placeholder="5×7" /></td>
                      <td className="px-1 py-1 w-28"><input className="input !py-1" list="bq-mat" value={r.mat} onChange={(e) => setRow(i, 'mat', e.target.value)} placeholder="Material" /></td>
                      <td className="px-1 py-1 w-20"><input className="input !py-1" value={r.thk} onChange={(e) => setRow(i, 'thk', e.target.value)} placeholder="18MM" /></td>
                      <td className="px-1 py-1 w-20"><input className="input !py-1" list="bq-unit" value={r.unit} onChange={(e) => setRow(i, 'unit', e.target.value)} placeholder="—" /></td>
                      <td className="px-1 py-1 text-center" title="Rate per SFT (qty = size W×H)">
                        <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={r.module} onChange={(e) => setRow(i, 'module', e.target.checked)} />
                      </td>
                      <td className="px-1 py-1 w-20"><CalcInput className="input !py-1 text-right tabular-nums" value={r.price} onChange={(v) => setRow(i, 'price', v)} title="Type a formula, e.g. 2850*45" /></td>
                      <td className="px-1 py-1 w-16">
                        {r.module
                          ? <input type="number" className="input !py-1 text-right tabular-nums bg-slate-100 text-slate-500" value={eff.qty ? +Number(eff.qty).toFixed(2) : ''} readOnly />
                          : <CalcInput className="input !py-1 text-right tabular-nums" value={r.qty} onChange={(v) => setRow(i, 'qty', v)} title="Type a formula, e.g. 2850*45" />}
                      </td>
                      <td className="px-1 py-1 w-16"><CalcInput className="input !py-1 text-right tabular-nums" value={r.gst} onChange={(v) => setRow(i, 'gst', v)} /></td>
                      <td className="px-2 py-1 text-right whitespace-nowrap font-semibold tabular-nums">{eff.hasInput ? inr0(eff.gross) : ''}</td>
                      <td className="px-1 py-1"><button className="btn-danger !px-2 !py-1" onClick={() => delRow(i)}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn-secondary mt-3" onClick={addRow}>+ Add Item</button>
        </div>
      </div>

      {/* totals */}
      <div className="card p-5 max-w-md ml-auto relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-300 via-primary-500 to-primary-700" />
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconCalc className="w-3.5 h-3.5" /></div>
            <div className="text-[13px] font-semibold text-slate-800">Totals</div>
          </div>
          <button className="btn-ghost !py-1" onClick={addCustom}>+ Add Row</button>
        </div>
        <div className="space-y-1">
          {totals.map((t) => {
            if (t.id === 'basicSaleValue') return <Line key={t.id} label="Basic Sale Value" value={inr0(calc.basicSale)} strong />;
            if (t.id === 'subTotal') return <Line key={t.id} label="Sub Total" value={inr0(calc.subTotal)} strong />;
            if (t.id === 'gst') return <Line key={t.id} label="GST (as applicable)" value={inr0(calc.totalGst)} />;
            if (t.type === 'manual-discount') return (
              <div key={t.id} className="flex items-center justify-between gap-2 text-[12.5px] py-1">
                <span className="text-rose-700">Discount</span>
                <div className="flex items-center gap-1">
                  <CalcInput className="input !py-1 w-16 text-right tabular-nums" value={t.value}
                    onChange={(v) => setTotal(t.id, { value: v })} /><span className="text-rose-700">%</span>
                  <span className="text-rose-700 w-24 text-right tabular-nums">− {inr0(calc.discount)}</span>
                </div>
              </div>
            );
            if (t.type === 'rate-area') return (
              <div key={t.id} className="flex items-center justify-between gap-2 text-[12.5px] py-1">
                <span className="text-slate-600">{t.label} <small className="text-primary-700">(₹{t.rate}/unit)</small></span>
                <div className="flex items-center gap-1">
                  <CalcInput className="input !py-1 w-16 text-right tabular-nums" placeholder="Area" value={t.area}
                    onChange={(v) => setTotal(t.id, { area: v })} />
                  <span className="text-slate-400">=</span>
                  <span className="w-24 text-right font-medium tabular-nums">{inr0((t.rate || 0) * (parseFloat(t.area) || 0))}</span>
                </div>
              </div>
            );
            // manual / custom
            const isCustom = t.id.startsWith('custom_');
            return (
              <div key={t.id} className="flex items-center justify-between gap-2 text-[12.5px] py-1">
                {isCustom
                  ? <input className="input !py-1 flex-1" value={t.label} onChange={(e) => setTotal(t.id, { label: e.target.value })} />
                  : <span className="text-slate-600">{t.label}</span>}
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">₹</span>
                  <CalcInput className="input !py-1 w-24 text-right tabular-nums" value={t.value}
                    onChange={(v) => setTotal(t.id, { value: v })} />
                  {isCustom && <button className="btn-danger !px-2 !py-0.5" onClick={() => removeTotal(t.id)}>✕</button>}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between mt-2 -mx-5 -mb-5 px-5 py-3 rounded-b-xl bg-gradient-to-r from-primary-50 to-primary-50/40 border-t border-primary-100">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary-800">Grand Total</span>
            <span className="text-[19px] font-bold text-gradient-gold tabular-nums">{inr0(calc.grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* revise modal */}
      {showRevise && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-start justify-center overflow-y-auto z-50 pt-10 px-4 pb-4" onClick={() => setShowRevise(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-80 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconClock className="w-4 h-4" /></div>
              <div className="text-[14px] font-semibold text-slate-900">Load Quotation</div>
            </div>
            <select className="input mb-3" value={selRef} onChange={(e) => setSelRef(e.target.value)}>
              {reviseList.length === 0 && <option value="">No saved quotations</option>}
              {reviseList.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={!selRef} onClick={loadSelected}>Load</button>
              <button className="btn-ghost" onClick={() => setShowRevise(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconDoc(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      <path d="M9 13h6" /><path d="M9 17h6" />
    </svg>
  );
}
function IconInfo(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><path d="M12 8h.01" />
    </svg>
  );
}
function IconList(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />
    </svg>
  );
}
function IconCalc(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8" /><path d="M8 11h.01" /><path d="M12 11h.01" /><path d="M16 11h.01" /><path d="M8 15h.01" /><path d="M12 15h.01" /><path d="M16 15h.01" /><path d="M8 19h.01" /><path d="M12 19h.01" /><path d="M16 19h.01" />
    </svg>
  );
}
function IconClock(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
    </svg>
  );
}

function Field({ label, value, onChange, onBlur, placeholder, type = 'text', readOnly, list }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} className={`input ${readOnly ? 'bg-slate-50' : ''}`} value={value} placeholder={placeholder}
        list={list} readOnly={readOnly} onBlur={onBlur}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined} />
    </div>
  );
}
function Line({ label, value, strong }) {
  return (
    <div className={`flex items-center justify-between text-[12.5px] py-1 ${strong ? 'font-semibold' : ''}`}>
      <span className="text-slate-600">{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}

/* ── PDF document (ported from prepareHtmlForPDF) ──────────────────────── */
function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function buildPdfHtml(header, rows, totals, calc) {
  const fv = (k) => esc(header[k] || '');
  const items = rows
    .map((r) => {
      const price = parseFloat(r.price) || 0;
      const { wt: pw, ht: ph } = parseSize(r.size);
    const qty = r.module ? moduleQty(pw, ph) : (parseFloat(r.qty) || 0);
      return { ...r, price, qty, gPct: parseFloat(r.gst) || 0, gross: price * qty };
    })
    .filter((it) => it.desc || it.area || it.price || it.qty);
  const hasNonSFT = items.some((it) => !it.module);
  const { basicSale, discount, discountPct, totalGst, subTotal, grandTotal } = calc;
  const showDiscount = discount > 0;

  let stoneHtml = '';
  items.forEach((it, idx) => {
    const imgH = it.img ? `<img src="${it.img}" style="width:34px;height:34px;object-fit:cover;border-radius:1px"/>` : '';
    const qDisp = it.qty ? (Number.isInteger(it.qty) ? it.qty : (+it.qty).toFixed(2)) : '';
    // Rate intentionally omitted from client-facing output — only Qty + line Amount shown.
    const qtyCell = hasNonSFT
      ? `<td class="num-c" style="text-align:right">${it.module ? '' : qDisp}</td>`
      : '';
    stoneHtml += `<tr><td class="num-c" style="text-align:center;color:#7a6e60;font-weight:700">${idx+1}</td><td>${imgH}</td><td>${esc(it.desc)}</td><td class="num-c" style="text-align:right">${esc(it.area)}</td><td>${esc(it.size)}</td><td>${esc(it.mat)}</td><td>${esc(it.thk)}</td><td>${esc(it.unit)}</td>${qtyCell}<td class="num-c" style="text-align:right">${it.gPct ? it.gPct.toFixed(2)+'%' : ''}</td><td class="num-c" style="text-align:right;font-weight:600">&#8377; ${inr2(it.gross)}</td></tr>`;
  });

  let totalsHtml = '';
  totals.forEach((row) => {
    if (row.id === 'basicSaleValue') totalsHtml += tr(row.label, '&#8377; ' + inr2(basicSale));
    else if (row.type === 'manual-discount') { if (showDiscount) totalsHtml += tr(`${esc(row.label)} (${discountPct}%)`, '&minus; &#8377; ' + inr0(discount).replace('₹ ',''), 'color:#9a3a1f;'); }
    else if (row.type === 'rate-area') { const v = (row.rate || 0) * (parseFloat(row.area) || 0); if (v > 0) totalsHtml += tr(row.label, '&#8377; ' + inr2(v)); }
    else if (row.type === 'manual') { const v = parseFloat(row.value) || 0; if (v > 0) totalsHtml += tr(esc(row.label), '&#8377; ' + inr2(v)); }
    else if (row.id === 'subTotal') totalsHtml += tr(row.label, '&#8377; ' + inr2(subTotal), '', 'sub');
    else if (row.id === 'gst') totalsHtml += tr(row.label + ' (As Applicable)', '&#8377; ' + inr2(totalGst));
  });
  function tr(l, v, style = '', cls = '') {
    return `<div class="tr ${cls}"><span class="l" style="${style}">${l}</span><span class="v" style="${style}">${v}</span></div>`;
  }

  const grandStr = '&#8377; ' + inr0(grandTotal).replace('₹ ', '');
  const SEP = ' <span style="margin:0 8px;color:rgba(176,141,87,0.4);">|</span> ';
  const hdr = `<div style="background:#243020;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #b08d57;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
    <div style="display:flex;align-items:center;gap:14px;"><img src="${CELESTILE_LOGO}" style="width:56px;height:56px;border-radius:50%;background:#000;object-fit:cover;"/>
      <div><div style="color:#d4b483;font-size:24px;letter-spacing:6px;font-family:'Cormorant Garamond',Georgia,serif;line-height:1;">CELESTILE<small style="display:block;font-size:8px;letter-spacing:3px;color:#b08d57;margin-top:5px;font-family:'Jost',sans-serif;">THE HOME &amp; BATH BOUTIQUE</small></div></div></div>
    <div style="text-align:right;"><div style="color:#d4b483;font-size:18px;letter-spacing:4px;font-family:'Cormorant Garamond',Georgia,serif;">QUOTATION</div>
      <div style="font-size:9px;letter-spacing:2px;color:#d4b483;margin-top:5px;font-family:Arial,sans-serif;background:rgba(176,141,87,0.1);border:1px solid rgba(176,141,87,0.4);padding:3px 10px;display:inline-block;">REF: ${fv('refNo')}</div></div></div>`;
  const ftr = `<div style="background:#243020;padding:10px 18px;text-align:center;border-top:3px solid #b08d57;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
    <p style="font-size:9px;letter-spacing:1.5px;color:#b08d57;text-transform:uppercase;margin:0;font-family:'Jost',sans-serif;">Celestile &middot; The Home &amp; Bath Boutique${SEP}www.celestile.com</p>
    <p style="font-size:9px;letter-spacing:1.5px;color:#8a6d3b;text-transform:uppercase;margin:0;font-family:'Jost',sans-serif;">BANGALORE: SARJAPUR MAIN ROAD${SEP}+91 9008882854</p></div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${fv('refNo')}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Jost:wght@300;400;500;600;700&display=swap" rel="stylesheet"><style>
@page{margin:12mm;size:A4}*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
body{font-family:'Jost',Helvetica,sans-serif;font-size:13px;color:#1a1a1a}.num-c{font-family:Arial,sans-serif !important}
.info-sec{background:#faf7f2;padding:10px 18px;border-bottom:1px solid #e8dece}.info-table{width:100%;border-collapse:collapse}
.info-table td{padding:3px 6px 6px;vertical-align:top;border-bottom:1px solid rgba(217,207,192,0.4)}
.lbl{font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#7a6e60;display:block;margin-bottom:3px}
.val{font-size:11px;font-weight:600;color:#1a1a1a}.body{padding:12px 18px;background:#faf7f2}
table.it{width:100%;border-collapse:collapse;font-size:9px;table-layout:auto}table.it thead tr{background:#243020}
table.it th{padding:7px 3px;color:rgba(232,218,196,0.92);font-size:7.5px;text-transform:uppercase;text-align:left;background:#243020;letter-spacing:0.5px}
table.it tbody tr{border-bottom:1px solid #f0e8dc}table.it tbody tr:nth-child(even){background:#faf7f2}table.it td{padding:5px 3px;vertical-align:middle}
.bg{display:grid;grid-template-columns:1fr 1.1fr;gap:12px;margin-top:14px}.bp{background:#faf7f2;border:1px solid #e8dece;padding:11px 13px}
.bt{font-size:10px;font-weight:700;letter-spacing:1.5px;color:#243020;text-transform:uppercase;margin-bottom:8px;border-bottom:1px solid #e8dece;padding-bottom:5px;font-family:'Cormorant Garamond',serif}
.br{display:flex;gap:8px;padding:5px 0;border-bottom:1px solid rgba(217,207,192,0.5);font-size:10px}.bk{width:80px;color:#7a6e60}.bv{color:#1a1a1a;font-weight:600;font-family:Arial,sans-serif}
.pt-title{font-family:'Cormorant Garamond',serif;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#243020;text-transform:uppercase;margin-top:10px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e8dece}
.pt{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid rgba(217,207,192,0.4);font-size:9.5px}.pt:last-child{border-bottom:none}.pt-pct{width:38px;color:#8a6d3b;font-weight:700;font-family:Arial,sans-serif}.pt-desc{color:#7a6e60}
.tp{border:1px solid #e8dece;overflow:hidden}.tr{display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #f0e8dc;font-size:10.5px}.tr .l{color:#7a6e60}.tr .v{font-weight:600;color:#1a1a1a;font-family:Arial,sans-serif;font-size:11px}.tr.sub{background:#faf7f2}
.tr.gd{background:#ede5d3;border-bottom:none;padding:11px 12px;border-top:2px solid rgba(176,141,87,0.5)}.tr.gd .l{color:#5a4a30;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600}.tr.gd .v{color:#243020;font-size:15px;font-weight:700;font-family:Arial,sans-serif}
.p2{page-break-before:always}.p2body{padding:14px 18px}.p2-sec-title{font-size:11px;font-weight:700;letter-spacing:2px;color:#243020;text-transform:uppercase;margin-bottom:14px;padding-bottom:7px;border-bottom:1px solid #e8dece;font-family:'Cormorant Garamond',serif}
.chars-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:14px}.char-card{background:#faf7f2;border-left:3px solid #b08d57;padding:12px 14px}.char-t{font-size:10.5px;font-weight:700;text-transform:uppercase;color:#243020;margin-bottom:6px}.char-b{font-size:10.5px;color:#7a6e60;line-height:1.65}
.terms-cols{columns:2;gap:22px;list-style:none;margin-bottom:18px}.terms-cols li{font-size:10px;color:#7a6e60;line-height:1.6;margin-bottom:8px;padding-left:12px;position:relative;break-inside:avoid}.terms-cols li::before{content:'\\2014';position:absolute;left:0;color:#b08d57}
.sigs{display:flex;gap:24px;margin-top:14px}.sig{flex:1;text-align:center}.sigline{height:30px;border-bottom:1px solid #d9cfc0}.siglbl{font-size:7px;letter-spacing:1.5px;text-transform:uppercase;color:#7a6e60;margin-top:4px}
</style></head><body>
${hdr}
<div class="info-sec"><table class="info-table">
<tr><td><span class="lbl">Date</span><span class="val">${fv('quoteDate')}</span></td><td><span class="lbl">Architect Name</span><span class="val">${fv('architectName')||'&mdash;'}</span></td><td><span class="lbl">Ref. No.</span><span class="val">${fv('refNo')}</span></td><td><span class="lbl">Boutique</span><span class="val">${fv('boutique')}</span></td></tr>
<tr><td><span class="lbl">Client Name</span><span class="val">${fv('clientName')}</span></td><td><span class="lbl">Architect Firm</span><span class="val">${fv('architectFirm')||'&mdash;'}</span></td><td><span class="lbl">Consultant</span><span class="val">${fv('consultant')||'&mdash;'}</span></td><td></td></tr>
<tr><td><span class="lbl">Client Contact</span><span class="val">${fv('clientContact')||'&mdash;'}</span></td><td><span class="lbl">Validity</span><span class="val">${fv('validity')||'&mdash;'}</span></td><td><span class="lbl">Consultant No.</span><span class="val">${fv('consultantNumber')||'&mdash;'}</span></td><td><span class="lbl">Email</span><span class="val">${fv('clientEmail')||'&mdash;'}</span></td></tr>
<tr><td><span class="lbl">Site Address</span><span class="val">${fv('siteAddress')||'&mdash;'}</span></td><td><span class="lbl">Lead Time</span><span class="val">${fv('leadTime')}</span></td><td><span class="lbl">Consultant Email</span><span class="val">${fv('consultantEmail')||'&mdash;'}</span></td><td><span class="lbl">Billing Address</span><span class="val">${fv('billingAddress')||'&mdash;'}</span></td></tr>
</table></div>
<div class="body"><table class="it"><thead><tr><th>#</th><th>Img</th><th>Description</th><th style="text-align:right">Area</th><th>Size (in)</th><th>Material</th><th>Thk</th><th>Unit</th>${hasNonSFT?'<th style="text-align:right">Qty</th>':''}<th style="text-align:right">GST%</th><th style="text-align:right">Amount</th></tr></thead><tbody>${stoneHtml}</tbody></table>
<div class="bg"><div class="bp"><div class="bt">Bank Details</div><div class="br"><span class="bk">Name</span><span class="bv">Vijayaananth Realtech</span></div><div class="br"><span class="bk">Account No.</span><span class="bv">50200093326161</span></div><div class="br"><span class="bk">Bank</span><span class="bv">HDFC Bank</span></div><div class="br"><span class="bk">IFSC Code</span><span class="bv">HDFC0001755</span></div><div class="pt-title">Payment Terms</div><div class="pt"><span class="pt-pct">60%</span><span class="pt-desc">Advance on order confirmation</span></div><div class="pt"><span class="pt-pct">35%</span><span class="pt-desc">Before delivery of material</span></div><div class="pt"><span class="pt-pct">5%</span><span class="pt-desc">Before completion of installation</span></div></div>
<div class="tp">${totalsHtml}<div class="tr gd"><span class="l">Grand Total</span><span class="v">${grandStr}</span></div></div></div></div>
${ftr}
<div class="p2">${hdr}<div class="p2body"><div class="p2-sec-title">Natural Stone Characteristics</div><div class="chars-grid">
<div class="char-card"><div class="char-t">Natural Variation</div><div class="char-b">As these are natural stones, variations in colour, grain pattern, porosity, and thickness of approximately 15&ndash;20% are inherent and to be expected.</div></div>
<div class="char-card"><div class="char-t">Cleaning Instructions</div><div class="char-b">Please avoid using acidic or alkaline substances to clean the stone surfaces, as they may cause permanent patches or discoloration.</div></div>
<div class="char-card"><div class="char-t">Natural Features</div><div class="char-b">Due to the natural structure of the stone, grains and pores may open up during production, transit, or installation. Our craftsmen will address these areas.</div></div>
<div class="char-card"><div class="char-t">Chemical Treatment Disclaimer</div><div class="char-b">The high-grade surface treatments used are synthetic and may age differently over time, causing the stone's appearance to evolve naturally.</div></div></div>
<div class="p2-sec-title">Terms &amp; Conditions</div><ul class="terms-cols">
<li>Payment Terms: A 60% advance is required upon order confirmation. The remaining 40% before delivery.</li>
<li>Order Policy: Once booked, products cannot be returned, exchanged, or cancelled.</li>
<li>Delivery &amp; Transportation: Dispatched from our local warehouse. Transportation charges based on delivery location.</li>
<li>Measurement Changes: Quotation revised as per actual site measurements.</li>
<li>Site Visit Charges: Additional charges apply for site visits outside Bengaluru.</li>
<li>Legal Jurisdiction: Disputes fall under the jurisdiction of Bengaluru, Karnataka.</li>
<li>Quotation Validity: Valid for 30 days from the date of issue.</li>
<li>Product Issues: Complaints must be reported within 24 hours of delivery if installation is not in Celes'tile scope.</li>
<li>Additional Charges: Transportation, loading, unloading, installation billed separately.</li>
<li>Installation Condition: Stone can be installed only on a cement-plastered wall.</li>
<li>Transit Tolerance: A standard transit damage margin of 5&ndash;7% is acceptable.</li>
<li>Delivery Schedule: Material delivered within 48 hours upon receipt of payment.</li>
<li>Design Iteration: Up to three drawing changes without additional fee.</li>
<li>Delivery Timeline: Estimated 40 to 60 days from order confirmation.</li>
<li>Storage Responsibility: If installation is delayed, client is responsible for safe storage.</li>
<li>Studio Timings: Monday&ndash;Saturday 9:30 am&ndash;7:30 pm. Closed Sundays.</li>
</ul>
<div class="sigs"><div class="sig"><div class="sigline"></div><div class="siglbl">Agreed by Client / Signature</div></div><div class="sig"><div class="sigline"></div><div class="siglbl">For Celestile / Authorized Signatory</div></div></div></div>${ftr}</div>
</body></html>`;
}

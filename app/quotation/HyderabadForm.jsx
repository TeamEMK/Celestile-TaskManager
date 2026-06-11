'use client';
import { useEffect, useMemo, useState } from 'react';
import { CELESTILE_LOGO } from '@/lib/celestile-logo';

const MATERIAL_LIST = ['Marble','Granite','Quartzite','Limestone','Travertine','Onyx','Sandstone','Slate','Porcelain','Ceramic','Vitrified','Natural Stone','Engineered Stone'];
const UNIT_OPTIONS = ['','Piece','Module','SFT','RFT','BAG','KG','GMS','LITER'];
const DEFAULT_GST = 18;

const inr2 = (n) => '₹ ' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrNeg = (n) => (Number(n) || 0) === 0 ? '– ₹ 0' : '– ₹ ' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const todayISO = () => new Date().toISOString().split('T')[0];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const validityFrom = (s) => { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return ''; d.setDate(d.getDate() + 30); return String(d.getDate()).padStart(2,'0') + '-' + MONTHS[d.getMonth()] + '-' + d.getFullYear(); };
const fmtDate = (s) => { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return String(s); return String(d.getDate()).padStart(2,'0') + '-' + MONTHS[d.getMonth()] + '-' + d.getFullYear(); };
function nextRevRef(ref) { const m = String(ref || '').match(/^(.*?)(?:-REV(\d+))?$/i); return m[1] + '-REV' + ((m[2] ? +m[2] : 0) + 1); }

const blankStone = () => ({ desc:'', area:'', sizeWt:'', sizeHt:'', mat:'', thk:'', unit:'', module:false, price:'', qty:'', gst:DEFAULT_GST, img:'' });
const DEFAULT_FIXING = [
  ['WHITE','ADHESIVE','20KG','BAG','2060'], ['CREAM','JOINTING CHEMICAL','','KG','1250'],
  ['CREAM PIGMENT','CHEMICAL','20 GMS','GMS','650'], ['STONE CLEANER','CLEANER','LITER','LITER','300'],
  ['DRY SEALER','SEALER','LITER','LITER','500'], ['W SEALER','SEALER','LITER','LITER','2050'],
  ['W2 SEALER','SEALER','LITER','LITER','6800'], ['CLEAR','JOINTING CHEMICAL','','KG','4400'],
  ['PLY WOOD','CHEMICAL','10KG','KG','13000'],
].map(([desc, mat, size, unit, price]) => ({ desc, mat, size, unit, price, qty: '' }));

/* Hyderabad totals math (mirrors updateTotals) */
function compute(stoneRows, fixRows, charges) {
  let stoneSum = 0, grossGst = 0;
  const perStone = stoneRows.map((r) => {
    const p = parseFloat(r.price) || 0;
    const q = r.module ? (parseFloat(r.sizeWt) || 0) * (parseFloat(r.sizeHt) || 0) : (parseFloat(r.qty) || 0);
    const gst = parseFloat(r.gst) || 0;
    const amt = p * q; stoneSum += amt; grossGst += amt * gst / 100;
    return { amt, q, hasInput: p > 0 || q > 0 };
  });
  const discPct = parseFloat(charges.discountPct) || 0;
  const discAmt = stoneSum * discPct / 100;
  const netStone = stoneSum - discAmt;
  const netGst = grossGst * (1 - discPct / 100);
  const designFees = parseFloat(charges.designFees) || 0;
  const totalGst = netGst + designFees * DEFAULT_GST / 100;
  const installation = parseFloat(charges.installationCharges) || 0;
  const packing = parseFloat(charges.packingCharges) || 0;
  const swg = netStone + designFees + totalGst;
  const fixSum = fixRows.reduce((s, r) => s + (parseFloat(r.price) || 0) * (parseFloat(r.qty) || 0), 0);
  const grandTotal = swg + fixSum + installation + packing;
  return { perStone, stoneSum, discPct, discAmt, netStone, designFees, totalGst, swg, fixSum, installation, packing, grandTotal };
}

const HEADER_FIELDS = [
  ['clientName','Client Name'], ['clientFirm','Client Firm'], ['consultant','Consultant','bq-consult'],
  ['consultantNo','Consultant No.'], ['consultantEmail','Consultant Email','bq-consult-email'],
  ['architect','Architect / Designer'], ['clientContact','Client Contact'], ['clientEmail','Client Email'],
  ['boutique','Boutique'], ['paymentTerms','Payment Terms'], ['leadTime','Lead Time'], ['transport','Mode of Transport'],
];

export default function HyderabadForm() {
  const [header, setHeader] = useState({
    quoteDate: todayISO(), refNo: '', clientName:'', clientFirm:'', consultant:'', consultantNo:'', consultantEmail:'',
    architect:'', clientContact:'', clientEmail:'', boutique:'Shamshabad, Hyderabad',
    paymentTerms:'80% Advance, 20% Before Delivery', leadTime:'60 Working Days', transport:'Road',
    validity:'', billingAddress:'', siteAddress:'',
  });
  const [charges, setCharges] = useState({ discountPct:'0', designFees:'0', installationCharges:'0', packingCharges:'0' });
  const [stoneRows, setStoneRows] = useState(() => Array.from({ length: 3 }, blankStone));
  const [fixRows, setFixRows] = useState(() => DEFAULT_FIXING.map((f) => ({ ...f })));
  const [consultants, setConsultants] = useState([]);
  const [reviseList, setReviseList] = useState([]);
  const [showRevise, setShowRevise] = useState(false);
  const [selRef, setSelRef] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const setH = (k, v) => setHeader((h) => ({ ...h, [k]: v }));
  const setC = (k, v) => setCharges((c) => ({ ...c, [k]: v }));
  const calc = useMemo(() => compute(stoneRows, fixRows, charges), [stoneRows, fixRows, charges]);

  useEffect(() => {
    fetch('/api/quotations/next-ref?branch=hyderabad').then((r) => r.json())
      .then((d) => setHeader((h) => ({ ...h, refNo: d.refNo || 'HQ-001' }))).catch(() => {});
    fetch('/api/consultants').then((r) => r.json())
      .then((d) => setConsultants(Array.isArray(d?.list) ? d.list : [])).catch(() => {});
    setHeader((h) => ({ ...h, validity: validityFrom(h.quoteDate) }));
  }, []);

  /* stone rows */
  const setStone = (i, k, v) => setStoneRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addStone = () => setStoneRows((rs) => [...rs, blankStone()]);
  const delStone = (i) => setStoneRows((rs) => rs.length === 1 ? [blankStone()] : rs.filter((_, idx) => idx !== i));
  /* fixing rows */
  const setFix = (i, k, v) => setFixRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addFix = () => setFixRows((rs) => [...rs, { desc:'', mat:'', size:'', unit:'', price:'', qty:'' }]);
  const delFix = (i) => setFixRows((rs) => rs.filter((_, idx) => idx !== i));

  function onConsultantBlur() {
    const c = consultants.find((x) => x.name.toLowerCase() === header.consultant.trim().toLowerCase());
    if (c) setHeader((h) => ({ ...h, consultantNo: h.consultantNo || c.mobile, consultantEmail: h.consultantEmail || c.email }));
  }

  async function save() {
    setSaving(true); setStatus('Saving…');
    const payload = {
      branch: 'hyderabad', refNo: header.refNo,
      clientName: header.clientName, clientFirm: header.clientFirm, consultant: header.consultant,
      consultantNo: header.consultantNo, consultantEmail: header.consultantEmail, architect: header.architect,
      clientContact: header.clientContact, clientEmail: header.clientEmail, boutique: header.boutique,
      paymentTerms: header.paymentTerms, validity: header.validity, leadTime: header.leadTime, transport: header.transport,
      billingAddress: header.billingAddress, siteAddress: header.siteAddress,
      discountPct: charges.discountPct, designFees: charges.designFees,
      installationCharges: charges.installationCharges, packingCharges: charges.packingCharges,
      grandTotal: inr2(calc.grandTotal),
      stoneItems: stoneRows.filter((r) => r.desc || Number(r.price) || Number(r.qty) || r.module),
      fixingItems: fixRows.filter((r) => Number(r.qty) > 0),
    };
    try {
      const res = await fetch('/api/quotations', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const d = await res.json();
      if (!res.ok || d.status === 'error') throw new Error(d.message || 'Save failed');
      setStatus('✅ Saved (' + d.refNo + ')');
    } catch (e) { setStatus('❌ ' + e.message); }
    finally { setSaving(false); }
  }

  async function openRevise() {
    setStatus('');
    try {
      const d = await (await fetch('/api/quotations?branch=hyderabad')).json();
      setReviseList(Array.isArray(d.refs) ? d.refs : []);
      setSelRef((d.refs || [])[0] || '');
      setShowRevise(true);
    } catch { setStatus('❌ Could not load list'); }
  }
  async function loadSelected() {
    if (!selRef) return;
    setShowRevise(false); setStatus('Loading…');
    try {
      const q = await (await fetch('/api/quotations?branch=hyderabad&ref=' + encodeURIComponent(selRef))).json();
      if (q.error) throw new Error(q.error);
      setHeader((h) => ({
        ...h, refNo: nextRevRef(q.refNo), clientName: q.clientName || '', clientFirm: q.clientFirm || '',
        consultant: q.consultant || '', consultantNo: q.consultantNo || q.consultantNumber || '', consultantEmail: q.consultantEmail || '',
        architect: q.architect || '', clientContact: q.clientContact || q.contact || '', clientEmail: q.clientEmail || q.email || '',
        boutique: q.boutique || h.boutique, paymentTerms: q.paymentTerms || h.paymentTerms, validity: q.validity || h.validity,
        leadTime: q.leadTime || h.leadTime, transport: q.transport || h.transport,
        billingAddress: q.billingAddress || '', siteAddress: q.siteAddress || '',
      }));
      setCharges({ discountPct: q.discountPct || '0', designFees: q.designFees || '0',
        installationCharges: q.installationCharges || '0', packingCharges: q.packingCharges || '0' });
      const items = Array.isArray(q.stoneItems) ? q.stoneItems : [];
      setStoneRows(items.length ? items.map((it) => ({ ...blankStone(), ...it, module: !!it.module, gst: it.gst ?? DEFAULT_GST })) : [blankStone()]);
      const fix = Array.isArray(q.fixingItems) ? q.fixingItems : [];
      setFixRows(fix.length ? fix.map((f) => ({ desc: f.desc || f.col1 || '', mat: f.mat || '', size: f.size || '', unit: f.unit || '', price: f.price || '', qty: f.qty || '' })) : []);
      setStatus('Loaded ' + q.refNo + ' → revising as ' + nextRevRef(q.refNo));
    } catch (e) { setStatus('❌ ' + e.message); }
  }

  function reset() {
    setHeader((h) => ({ ...h, clientName:'', clientFirm:'', consultant:'', consultantNo:'', consultantEmail:'', architect:'',
      clientContact:'', clientEmail:'', billingAddress:'', siteAddress:'', boutique:'Shamshabad, Hyderabad',
      paymentTerms:'80% Advance, 20% Before Delivery', leadTime:'60 Working Days', transport:'Road',
      quoteDate: todayISO(), validity: validityFrom(todayISO()) }));
    setCharges({ discountPct:'0', designFees:'0', installationCharges:'0', packingCharges:'0' });
    setStoneRows(Array.from({ length: 3 }, blankStone));
    setFixRows(DEFAULT_FIXING.map((f) => ({ ...f })));
    fetch('/api/quotations/next-ref?branch=hyderabad').then((r) => r.json()).then((d) => setH('refNo', d.refNo || 'HQ-001')).catch(() => {});
    setStatus('');
  }

  function printPdf() {
    const html = buildPdfHtml(header, charges, stoneRows, fixRows, calc);
    const w = window.open('', '_blank');
    if (!w) { setStatus('❌ Popup blocked — allow popups to print.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 700);
  }

  return (
    <div className="space-y-4">
      <datalist id="bq-mat">{MATERIAL_LIST.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="bq-consult">{consultants.map((c) => <option key={c.name} value={c.name} />)}</datalist>
      <datalist id="bq-consult-email">{consultants.map((c) => c.email && <option key={c.email} value={c.email} />)}</datalist>

      <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[15px] font-semibold text-slate-900">Quotation — Hyderabad</div>
          <div className="text-[12px] text-slate-500">Ref: <b>{header.refNo || '—'}</b></div>
        </div>
        <div className="flex items-center gap-2">
          {status && <span className="text-[12px] mr-2">{status}</span>}
          <button className="btn-ghost" onClick={reset}>↺ Reset</button>
          <button className="btn-secondary" onClick={openRevise}>Revise</button>
          <button className="btn-secondary" onClick={printPdf}>⬇ PDF</button>
          <button className="btn-warn" disabled={saving} onClick={save}>{saving ? 'Saving…' : '💾 Save'}</button>
        </div>
      </div>

      {/* header */}
      <div className="card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Date" type="date" value={header.quoteDate}
            onChange={(v) => setHeader((h) => ({ ...h, quoteDate: v, validity: validityFrom(v) }))} />
          {HEADER_FIELDS.map(([k, label, list]) => (
            <Field key={k} label={label} value={header[k]} list={list}
              onBlur={k === 'consultant' ? onConsultantBlur : undefined} onChange={(v) => setH(k, v)} />
          ))}
          <Field label="Validity" value={header.validity} readOnly />
          <Field label="Site Address" value={header.siteAddress} onChange={(v) => setH('siteAddress', v)} />
          <Field label="Billing Address" value={header.billingAddress} onChange={(v) => setH('billingAddress', v)} />
        </div>
      </div>

      {/* stone items */}
      <div className="card p-5">
        <div className="text-[13px] font-semibold text-slate-800 mb-2">Stone &amp; Tile Items</div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-900 text-white">
              <tr>{['#','Description','Area','Size Wt','Size Ht','Material','Thickness','Unit','SFT','Rate ₹','Qty','GST %','Amount',''].map((h, i) =>
                <th key={i} className="px-2 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {stoneRows.map((r, i) => {
                const eff = calc.perStone[i] || { amt: 0, q: 0, hasInput: false };
                return (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                    <td className="px-1 py-1 min-w-[140px]"><input className="input !py-1" value={r.desc} onChange={(e) => setStone(i, 'desc', e.target.value)} placeholder="Description" /></td>
                    <td className="px-1 py-1 w-16"><input className="input !py-1" value={r.area} onChange={(e) => setStone(i, 'area', e.target.value)} placeholder="Area" /></td>
                    <td className="px-1 py-1 w-16"><input className="input !py-1" value={r.sizeWt} onChange={(e) => setStone(i, 'sizeWt', e.target.value)} placeholder="Wt" /></td>
                    <td className="px-1 py-1 w-16"><input className="input !py-1" value={r.sizeHt} onChange={(e) => setStone(i, 'sizeHt', e.target.value)} placeholder="Ht" /></td>
                    <td className="px-1 py-1 w-28"><input className="input !py-1" list="bq-mat" value={r.mat} onChange={(e) => setStone(i, 'mat', e.target.value)} placeholder="Material" /></td>
                    <td className="px-1 py-1 w-20"><input className="input !py-1" value={r.thk} onChange={(e) => setStone(i, 'thk', e.target.value)} placeholder="Thk" /></td>
                    <td className="px-1 py-1 w-20">
                      <select className="input !py-1" value={r.unit} onChange={(e) => setStone(i, 'unit', e.target.value)}>
                        {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u || '—'}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1 text-center" title="SFT: qty = Wt × Ht">
                      <input type="checkbox" className="h-4 w-4 accent-slate-700" checked={r.module} onChange={(e) => setStone(i, 'module', e.target.checked)} />
                    </td>
                    <td className="px-1 py-1 w-20"><input type="number" min="0" className="input !py-1" value={r.price} onChange={(e) => setStone(i, 'price', e.target.value)} /></td>
                    <td className="px-1 py-1 w-16"><input type="number" min="0" className={`input !py-1 ${r.module ? 'bg-slate-100 text-slate-500' : ''}`}
                      value={r.module ? (eff.q ? +Number(eff.q).toFixed(2) : '') : r.qty} readOnly={r.module} onChange={(e) => setStone(i, 'qty', e.target.value)} /></td>
                    <td className="px-1 py-1 w-16"><input type="number" min="0" max="100" className="input !py-1" value={r.gst} onChange={(e) => setStone(i, 'gst', e.target.value)} /></td>
                    <td className="px-2 py-1 text-right whitespace-nowrap font-semibold">{eff.hasInput ? inr2(eff.amt) : ''}</td>
                    <td className="px-1 py-1"><button className="btn-danger !px-2 !py-1" onClick={() => delStone(i)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button className="btn-secondary mt-3" onClick={addStone}>+ Add Stone Item</button>
      </div>

      {/* fixing items */}
      <div className="card p-5">
        <div className="text-[13px] font-semibold text-slate-800 mb-2">Fixing Material</div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-700 text-white">
              <tr>{['#','Description','Material','Size / Thickness','Unit','Rate ₹','Qty','Amount',''].map((h, i) =>
                <th key={i} className="px-2 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {fixRows.map((r, i) => {
                const amt = (parseFloat(r.price) || 0) * (parseFloat(r.qty) || 0);
                return (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                    <td className="px-1 py-1"><input className="input !py-1" value={r.desc} onChange={(e) => setFix(i, 'desc', e.target.value)} /></td>
                    <td className="px-1 py-1"><input className="input !py-1" value={r.mat} onChange={(e) => setFix(i, 'mat', e.target.value)} /></td>
                    <td className="px-1 py-1 w-24"><input className="input !py-1" value={r.size} onChange={(e) => setFix(i, 'size', e.target.value)} /></td>
                    <td className="px-1 py-1 w-20"><input className="input !py-1" value={r.unit} onChange={(e) => setFix(i, 'unit', e.target.value)} /></td>
                    <td className="px-1 py-1 w-20"><input type="number" min="0" className="input !py-1" value={r.price} onChange={(e) => setFix(i, 'price', e.target.value)} /></td>
                    <td className="px-1 py-1 w-16"><input type="number" min="0" className="input !py-1" value={r.qty} onChange={(e) => setFix(i, 'qty', e.target.value)} /></td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">{amt ? inr2(amt) : '₹ 0'}</td>
                    <td className="px-1 py-1"><button className="btn-danger !px-2 !py-1" onClick={() => delFix(i)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button className="btn-secondary mt-3" onClick={addFix}>+ Add Fixing Item</button>
      </div>

      {/* charges + totals */}
      <div className="card p-5 max-w-md ml-auto space-y-2">
        <div className="text-[13px] font-semibold text-slate-800 mb-1">Charges &amp; Totals</div>
        <ChargeInput label="Discount %" value={charges.discountPct} onChange={(v) => setC('discountPct', v)} suffix="%" />
        <ChargeInput label="Design Fees" value={charges.designFees} onChange={(v) => setC('designFees', v)} />
        <ChargeInput label="Installation Charges" value={charges.installationCharges} onChange={(v) => setC('installationCharges', v)} />
        <ChargeInput label="Packing Charges" value={charges.packingCharges} onChange={(v) => setC('packingCharges', v)} />
        <div className="border-t border-slate-200 pt-2 space-y-1">
          <Line label="Basic Sale Value (Stone)" value={inr2(calc.stoneSum)} />
          {calc.discAmt > 0 && <Line label={`Discount @ ${calc.discPct}%`} value={inrNeg(calc.discAmt)} />}
          {calc.discAmt > 0 && <Line label="Net Stone Value" value={inr2(calc.netStone)} />}
          <Line label="Design Fees" value={inr2(calc.designFees)} />
          <Line label="GST (Total)" value={inr2(calc.totalGst)} />
          <Line label="Stone Total (Incl. GST)" value={inr2(calc.swg)} strong />
          <Line label="Fixing Material Total" value={inr2(calc.fixSum)} />
          <Line label="Installation Charges" value={inr2(calc.installation)} />
          {calc.packing > 0 && <Line label="Packing Charges" value={inr2(calc.packing)} />}
          <div className="flex items-center justify-between pt-2 mt-1 border-t-2 border-amber-300">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-700">Grand Total</span>
            <span className="text-[18px] font-bold text-slate-900">{inr2(calc.grandTotal)}</span>
          </div>
        </div>
      </div>

      {showRevise && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setShowRevise(false)}>
          <div className="bg-white rounded-xl p-5 w-80" onClick={(e) => e.stopPropagation()}>
            <div className="text-[14px] font-semibold mb-3">Load Quotation</div>
            <select className="input mb-3" value={selRef} onChange={(e) => setSelRef(e.target.value)}>
              {reviseList.length === 0 && <option value="">No saved quotations</option>}
              {reviseList.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="flex gap-2">
              <button className="btn-warn flex-1" disabled={!selRef} onClick={loadSelected}>Load</button>
              <button className="btn-ghost" onClick={() => setShowRevise(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, onBlur, type = 'text', readOnly, list }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} className={`input ${readOnly ? 'bg-slate-50' : ''}`} value={value} list={list} readOnly={readOnly}
        onBlur={onBlur} onChange={onChange ? (e) => onChange(e.target.value) : undefined} />
    </div>
  );
}
function ChargeInput({ label, value, onChange, suffix }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12.5px]">
      <span className="text-slate-600">{label}</span>
      <div className="flex items-center gap-1">
        {!suffix && <span className="text-slate-400">₹</span>}
        <input type="number" min="0" className="input !py-1 w-28 text-right" value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}
function Line({ label, value, strong }) {
  return (
    <div className={`flex items-center justify-between text-[12.5px] py-0.5 ${strong ? 'font-semibold' : ''}`}>
      <span className="text-slate-600">{label}</span><span>{value}</span>
    </div>
  );
}

/* ── Hyderabad PDF (blue theme, ported from prepareHtmlForPDF) ─────────── */
function buildPdfHtml(header, charges, stoneRows, fixRows, calc) {
  const fv = (k) => esc(header[k] || '');
  const f2 = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const stoneItems = stoneRows
    .map((r) => {
      const p = parseFloat(r.price) || 0;
      const q = r.module ? (parseFloat(r.sizeWt) || 0) * (parseFloat(r.sizeHt) || 0) : (parseFloat(r.qty) || 0);
      return { ...r, p, q, gst: parseFloat(r.gst) || 0 };
    })
    .filter((it) => it.desc || it.p || it.q);
  const hasNonSFT = stoneItems.some((it) => !it.module);

  let stoneHtml = '';
  stoneItems.forEach((it, idx) => {
    const imgH = it.img ? `<img src="${it.img}" style="width:32px;height:32px;object-fit:cover;border-radius:1px">` : '';
    const qDisp = it.q ? (Number.isInteger(it.q) ? it.q : (+it.q).toFixed(2)) : '';
    const rateQty = hasNonSFT
      ? (it.module ? '<td colspan="2"></td>'
        : `<td class="num" style="text-align:right">${it.p ? f2(it.p) : ''}</td><td class="num" style="text-align:right">${qDisp}</td>`) : '';
    stoneHtml += `<tr><td class="num" style="text-align:center;font-weight:600;color:#7a6e60">${idx+1}</td><td>${imgH}</td><td class="desc-cell">${esc(it.desc)}</td><td>${esc(it.area)}</td><td>${esc(it.sizeWt)}</td><td>${esc(it.sizeHt)}</td><td>${esc(it.mat)}</td><td>${esc(it.thk)}</td><td>${esc(it.unit)}</td>${rateQty}<td class="num" style="text-align:right">${it.gst}%</td><td class="num" style="text-align:right;font-weight:600">₹ ${f2(it.p * it.q)}</td></tr>`;
  });

  let fixHtml = '', fi = 0;
  fixRows.forEach((r) => {
    const q = parseFloat(r.qty) || 0; if (q <= 0) return;
    const p = parseFloat(r.price) || 0; fi++;
    fixHtml += `<tr><td class="num" style="text-align:center;font-weight:600;color:#7a6e60">${fi}</td><td>${esc(r.desc)}</td><td>${esc(r.mat)}</td><td>${esc(r.size)}</td><td>${esc(r.unit)}</td><td class="num" style="text-align:right">${f2(p)}</td><td class="num" style="text-align:right">${q}</td><td class="num" style="text-align:right;font-weight:600">₹ ${f2(p * q)}</td></tr>`;
  });

  const discPct = parseFloat(charges.discountPct) || 0;
  const packingNum = parseFloat(charges.packingCharges) || 0;
  const t = {
    bsv: inr2(calc.stoneSum), disc: inrNeg(calc.discAmt), nsv: inr2(calc.netStone), df: inr2(calc.designFees),
    gst: inr2(calc.totalGst), swg: inr2(calc.swg), ft: inr2(calc.fixSum), inst: inr2(calc.installation),
    pack: inr2(calc.packing), gt: inr2(calc.grandTotal),
  };

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${fv('refNo')}</title><style>
@page{margin:10mm;size:A4}*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;font-size:9px;color:#1a1a1a;background:#fff}
.num,td.num{font-family:Arial,Helvetica,sans-serif!important}
.hdr{background:#22409A;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.brand-wrap{display:flex;align-items:center;gap:12px}.brand-logo{height:54px;width:auto;border-radius:50%;background:#000}
.brand-tagline{font-size:6.5px;letter-spacing:3px;color:rgba(212,180,131,0.85);text-transform:uppercase}
.doc-type{color:#d4b483;font-size:11px;letter-spacing:3px}.ref-b{font-size:6.5px;letter-spacing:2px;color:rgba(232,218,196,0.75);margin-top:4px;background:rgba(176,141,87,0.18);padding:2px 8px;display:inline-block}
.info-sec{background:#faf7f2;padding:8px 18px;border-top:1px solid #b08d57;border-bottom:1px solid #b08d57}
.info-table{width:100%;border-collapse:collapse}.info-table td{padding:3px 8px 5px;vertical-align:top;border-right:1px solid rgba(217,207,192,0.55);border-bottom:1px solid rgba(217,207,192,0.35)}
.info-table tr:last-child td{border-bottom:none}.info-table td:last-child{border-right:none}
.lbl{font-size:6.5px;letter-spacing:1.5px;text-transform:uppercase;color:#7a6e60;display:block;margin-bottom:1px}.val{font-size:9px;font-weight:600}
.body{padding:10px 18px}.sh{display:flex;align-items:center;gap:8px;margin:8px 0 5px}
.snum{width:16px;height:16px;border-radius:50%;background:#22409A;color:#d4b483;font-size:6.5px;font-weight:700;display:flex;align-items:center;justify-content:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slbl{font-size:8.5px;font-weight:700;letter-spacing:2px;color:#22409A;text-transform:uppercase}.srule{flex:1;height:1px;background:#e8dece}
table.it{width:100%;border-collapse:collapse;font-size:7px;margin-bottom:6px;border:1px solid #b08d57}
table.it thead tr{background:#22409A;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table.it th{padding:5px 4px;color:#e8dac4;font-weight:600;letter-spacing:0.7px;font-size:6.5px;text-transform:uppercase;border-right:1px solid rgba(176,141,87,0.25);text-align:left}
table.it tbody tr{border-bottom:1px solid #e8dece}table.it tbody tr:nth-child(even){background:#f4f6fb;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table.it td{padding:3px 4px;border-right:1px solid #efe6d4;vertical-align:middle;word-wrap:break-word}.desc-cell{white-space:pre-wrap;line-height:1.35}
.bg{display:grid;grid-template-columns:1fr 1.1fr;gap:10px;margin-top:10px}
.bp{background:#faf7f2;border:1px solid #b08d57;padding:8px 10px}.bt{font-size:7.5px;font-weight:700;letter-spacing:1.5px;color:#22409A;text-transform:uppercase;margin-bottom:6px;border-bottom:1.5px solid #b08d57;padding-bottom:4px}
.br{display:flex;gap:8px;padding:2px 0;border-bottom:1px solid rgba(217,207,192,0.5);font-size:7.5px}.bk{width:68px;color:#7a6e60;font-weight:500}.bv{color:#1a1a1a;font-weight:600}
.tp{border:1px solid #b08d57;overflow:hidden}.tr{display:flex;justify-content:space-between;align-items:center;padding:5px 10px;border-bottom:1px solid #f0e8dc;font-size:8px}.tr .l{color:#7a6e60}.tr .v{font-weight:600}
.tr.sub{background:#faf7f2;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.tr.gd{background:#22409A;border-bottom:none;padding:7px 10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.tr.gd .l{color:rgba(232,218,196,0.6);font-size:7px;letter-spacing:1px;text-transform:uppercase}.tr.gd .v{color:#d4b483;font-size:10.5px}
.terms{padding:8px 18px;background:#faf7f2;border-top:1px solid #e8dece}.terms-t{font-size:7.5px;font-weight:700;letter-spacing:2px;color:#22409A;text-transform:uppercase;margin-bottom:6px}
.terms ul{columns:2;gap:16px;list-style:none}.terms li{font-size:7px;color:#7a6e60;line-height:1.45;margin-bottom:2px;padding-left:8px;position:relative}.terms li::before{content:'\\2014';position:absolute;left:0;color:#b08d57}.terms li.hl{color:#1a1a1a;font-weight:700}
.sigs{display:flex;gap:24px;padding:8px 18px}.sig{flex:1;text-align:center}.sigline{height:24px;border-bottom:1px solid #d9cfc0}.siglbl{font-size:6.5px;letter-spacing:1.5px;text-transform:uppercase;color:#7a6e60;margin-top:4px}
.ftr{background:#22409A;padding:8px 18px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ftr p{font-size:6.5px;letter-spacing:1.5px;color:rgba(176,141,87,0.7);text-transform:uppercase;line-height:1.85}
</style></head><body>
<div class="hdr"><div class="brand-wrap"><img class="brand-logo" src="${CELESTILE_LOGO}"><div><div style="color:#d4b483;font-size:20px;letter-spacing:5px;font-family:Georgia,serif">CELESTILE</div><div class="brand-tagline">Hyderabad Boutique</div></div></div>
<div style="text-align:right"><div class="doc-type">QUOTATION</div><div class="ref-b">REF: ${fv('refNo')}</div></div></div>
<div class="info-sec"><table class="info-table">
<tr><td><span class="lbl">Date</span><span class="val num">${fmtDate(header.quoteDate)}</span></td><td><span class="lbl">Client Name</span><span class="val">${fv('clientName')||'—'}</span></td><td><span class="lbl">Consultant</span><span class="val">${fv('consultant')||'—'}</span></td><td><span class="lbl">Boutique</span><span class="val">${fv('boutique')}</span></td></tr>
<tr><td><span class="lbl">Ref. No.</span><span class="val num">${fv('refNo')}</span></td><td><span class="lbl">Client Contact No.</span><span class="val num">${fv('clientContact')||'—'}</span></td><td><span class="lbl">Consultant No.</span><span class="val num">${fv('consultantNo')||'—'}</span></td><td><span class="lbl">Payment Terms</span><span class="val">${fv('paymentTerms')}</span></td></tr>
<tr><td><span class="lbl">Lead Time</span><span class="val">${fv('leadTime')}</span></td><td><span class="lbl">Client Firm</span><span class="val">${fv('clientFirm')||'—'}</span></td><td><span class="lbl">Consultant Email</span><span class="val">${fv('consultantEmail')||'—'}</span></td><td><span class="lbl">Mode of Transport</span><span class="val">${fv('transport')}</span></td></tr>
<tr><td><span class="lbl">Validity</span><span class="val num">${fv('validity')}</span></td><td><span class="lbl">Client Email</span><span class="val">${fv('clientEmail')||'—'}</span></td><td colspan="2"><span class="lbl">Architect / Designer</span><span class="val">${fv('architect')||'—'}</span></td></tr>
<tr><td colspan="2"><span class="lbl">Billing Address</span><span class="val">${fv('billingAddress')||'—'}</span></td><td colspan="2"><span class="lbl">Site Address</span><span class="val">${fv('siteAddress')||'—'}</span></td></tr>
</table></div>
<div class="body">
<div class="sh"><div class="snum">01</div><div class="slbl">Stone &amp; Tile Items</div><div class="srule"></div></div>
<table class="it"><thead><tr><th>#</th><th>Img</th><th>Description</th><th>Area</th><th>Size Wt</th><th>Size Ht</th><th>Material</th><th>Thickness</th><th>Unit</th>${hasNonSFT?'<th style="text-align:right">Rate (₹)</th><th style="text-align:right">Qty</th>':''}<th style="text-align:right">GST%</th><th style="text-align:right">Amount</th></tr></thead><tbody>${stoneHtml}</tbody></table>
<div class="sh" style="margin-top:8px"><div class="snum">02</div><div class="slbl">Fixing Material</div><div class="srule"></div></div>
<table class="it"><thead><tr><th>#</th><th>Description</th><th>Material</th><th>Size / Thickness</th><th>Unit</th><th style="text-align:right">Rate (₹)</th><th style="text-align:right">Qty</th><th style="text-align:right">Amount</th></tr></thead><tbody>${fixHtml}</tbody></table>
<div class="bg"><div class="bp"><div class="bt">Bank Details</div>
<div class="br"><span class="bk">Name</span><span class="bv">S K Marketing Tiles &amp; Tapz</span></div>
<div class="br"><span class="bk">Account No.</span><span class="bv num">8008002700</span></div>
<div class="br"><span class="bk">Bank</span><span class="bv">Kotak Mahindra Bank</span></div>
<div class="br"><span class="bk">Branch</span><span class="bv">Srinagar Colony</span></div>
<div class="br"><span class="bk">IFSC Code</span><span class="bv num">KKBK0007488</span></div>
<div class="br"><span class="bk">UPI ID</span><span class="bv">celestile@kotak</span></div></div>
<div class="tp"><div class="tr"><span class="l">Basic Sale Value (Stone)</span><span class="v">${t.bsv}</span></div>
${discPct > 0 ? `<div class="tr"><span class="l">Discount @ ${discPct}%</span><span class="v">${t.disc}</span></div><div class="tr sub"><span class="l">Net Stone Value</span><span class="v">${t.nsv}</span></div>` : ''}
<div class="tr"><span class="l">Design Fees (Concept)</span><span class="v">${t.df}</span></div>
<div class="tr"><span class="l">GST (Total)</span><span class="v">${t.gst}</span></div>
<div class="tr sub"><span class="l">Stone Total (Incl. GST)</span><span class="v">${t.swg}</span></div>
<div class="tr"><span class="l">Fixing Material Total</span><span class="v">${t.ft}</span></div>
<div class="tr"><span class="l">Installation Charges</span><span class="v">${t.inst}</span></div>
${packingNum > 0 ? `<div class="tr"><span class="l">Packing Charges</span><span class="v">${t.pack}</span></div>` : ''}
<div class="tr gd"><span class="l">Grand Total</span><span class="v">${t.gt}</span></div></div></div></div>
<div class="terms"><div class="terms-t">Terms &amp; Conditions</div><ul>
<li>Quotation valid for 30 days from date of issue.</li>
<li>80% Advance against order confirmation. Balance 20% before delivery.</li>
<li>Payment via Cheque / DD / Transfer in favor of SK Marketing Tiles And Tapz.</li>
<li>Products once booked cannot be returned, exchanged or cancelled.</li>
<li>All disputes subject to Hyderabad, Telangana jurisdiction only.</li>
<li>Delivery 40–60 working days from drawing confirmation.</li>
<li>Products delivered from Factory @ Jadcherla; local transport extra.</li>
<li>Natural stones have 15–20% variation in color &amp; size.</li>
<li>Complaints within 24 hours of delivery.</li>
<li>Stone can only be installed on a cement-plastered wall.</li>
<li>Transit damage margin of 5–7% is acceptable within industry norms.</li>
<li class="hl">If material is ready for dispatch, the client must issue full payment.</li>
<li class="hl">Celestile will hold ready material for only 15 days; beyond which 2% of bill value/month storage applies.</li>
</ul></div>
<div class="sigs"><div class="sig"><div class="sigline"></div><div class="siglbl">Agreed by Client / Signature</div></div><div class="sig"><div class="sigline"></div><div class="siglbl">For Celestile / Authorized Signatory</div></div></div>
<div class="ftr"><p>Celestile · The Home &amp; Bath Boutique · www.celestile.com</p><p>Shamshabad, Hyderabad · +91 800 800 2700</p><p>Sarjapur Road, Bangalore · +91 080 2665 8884</p></div>
</body></html>`;
}

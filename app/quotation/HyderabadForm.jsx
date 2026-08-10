'use client';
import { useEffect, useMemo, useState } from 'react';
import { CELESTILE_LOGO_FULL, CELESTILE_MARK_RED } from '@/lib/celestile-logo';
import { fileToThumbnail } from './imageThumb';
import { CalcInput } from './calcExpr';
import { ZoomImg } from '@/app/components/ImageLightbox';
import { useQuotationMaster, AddItemModal, ADD_ITEM_VALUE } from './useQuotationMaster';

const MATERIAL_LIST = ['Marble','Granite','Quartzite','Limestone','Travertine','Onyx','Sandstone','Slate','Porcelain','Ceramic','Vitrified','Natural Stone','Engineered Stone'];
const UNIT_OPTIONS = ['','Piece','Module','SFT','RFT','BAG','KG','GMS','LITER'];
const DEFAULT_GST = 18;

const inr2 = (n) => '₹ ' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const roundDim6 = (n) => Math.ceil((Number(n) || 0) / 6) * 6;
const moduleQty = (wt, ht) => (roundDim6(wt) * roundDim6(ht)) / 144;
const inrNeg = (n) => (Number(n) || 0) === 0 ? '– ₹ 0' : '– ₹ ' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const todayISO = () => new Date().toISOString().split('T')[0];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const validityFrom = (s) => { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return ''; d.setDate(d.getDate() + 30); return String(d.getDate()).padStart(2,'0') + '-' + MONTHS[d.getMonth()] + '-' + d.getFullYear(); };
const fmtDate = (s) => { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return String(s); return String(d.getDate()).padStart(2,'0') + '-' + MONTHS[d.getMonth()] + '-' + d.getFullYear(); };
function nextRevRef(ref) { const m = String(ref || '').match(/^(.*?)(?:-REV(\d+))?$/i); return m[1] + '-REV' + ((m[2] ? +m[2] : 0) + 1); }

const blankStone = () => ({ desc:'', area:'', sizeWt:'', sizeHt:'', mat:'', thk:'', unit:'', module:false, price:'', qty:'', gst:DEFAULT_GST, img:'' });
// Wall-fixing rate card (per 100 SFT coverage, priced by stone type) — single
// source of truth for both the default rows below and the Fixing Material
// dropdown's auto-fill (picking a stone there sets its rate from here).
const FIXING_RATE_CARD = [
  { name:'SANDSTONE', rate:'31040' }, { name:'INDIAN', rate:'23290' },
  { name:'NERO MARBLE', rate:'24690' }, { name:'VIETNAM WHITE', rate:'23290' },
];
// `slab:true` rows bill in whole 100-SFT blocks — see fixAmount() — rather than qty × price.
const DEFAULT_FIXING = FIXING_RATE_CARD.map(({ name, rate }) =>
  ({ desc:name, mat:'Wall Fixing', size:'100 SFT', unit:'SFT', price:rate, qty:'', slab:true }));

// A slab-priced ("100 SFT") fixing row bills in whole 100-SFT blocks: up to
// 100 SFT = 1x the rate, 101–200 SFT = 2x, etc. — i.e. rate × ceil(SFT/100),
// never a fraction of the rate. Non-slab rows keep plain qty × price.
function fixAmount(r) {
  const price = parseFloat(r.price) || 0;
  const qty = parseFloat(r.qty) || 0;
  return r.slab ? price * Math.ceil(qty / 100) : price * qty;
}

/* Hyderabad totals math (mirrors updateTotals) */
function compute(stoneRows, fixRows, charges) {
  let stoneSum = 0, grossGst = 0;
  const perStone = stoneRows.map((r) => {
    const p = parseFloat(r.price) || 0;
    const q = r.module ? moduleQty(parseFloat(r.sizeWt) || 0, parseFloat(r.sizeHt) || 0) : (parseFloat(r.qty) || 0);
    const gst = parseFloat(r.gst) || 0;
    const amt = p * q; stoneSum += amt; grossGst += amt * gst / 100;
    return { amt, q, hasInput: p > 0 || q > 0 };
  });
  const discPct = parseFloat(charges.discountPct) || 0;
  const discAmt = stoneSum * discPct / 100;
  const netStone = stoneSum - discAmt;
  const netGst = grossGst * (1 - discPct / 100);
  const designFees = parseFloat(charges.designFees) || 0;
  const designGst = designFees * DEFAULT_GST / 100;
  const installation = parseFloat(charges.installationCharges) || 0;
  const packing = parseFloat(charges.packingCharges) || 0;
  const fixSum = fixRows.reduce((s, r) => s + fixAmount(r), 0);
  // GST applies to everything except Installation Charges (client rule,
  // 2026-08-07): stone, design fees, fixing material and packing all carry
  // GST @18% (stone rows use their own per-row rate); only installation is tax-free.
  const fixGst = fixSum * DEFAULT_GST / 100;
  const packingGst = packing * DEFAULT_GST / 100;
  const stoneDesignGst = netGst + designGst;
  const swg = netStone + designFees + stoneDesignGst; // Stone Total (Incl. GST) — stone + design fees only
  const totalGst = stoneDesignGst + fixGst + packingGst; // GST (Total) — every taxed line
  const grandTotal = netStone + designFees + fixSum + packing + installation + totalGst;
  return { perStone, stoneSum, discPct, discAmt, netStone, designFees, totalGst, swg, fixSum, installation, packing, grandTotal };
}

// Flat field order — mirrors the info-table grouping shown in the delivered
// PDF/Apps Script tool (Date/Client/Consultant/Boutique per row, etc.).
const FIELD_ORDER = [
  { key:'quoteDate', label:'Date', type:'date' },
  { key:'clientName', label:'Client Name' },
  { key:'consultant', label:'Consultant', list:'qh-consult', useOnBlur:true },
  { key:'boutique', label:'Boutique' },
  { key:'refNo', label:'Quotation Ref. No.', readOnly:true },
  { key:'clientContact', label:'Client Contact No.' },
  { key:'consultantNo', label:'Consultant No.' },
  { key:'paymentTerms', label:'Payment Terms' },
  { key:'leadTime', label:'Lead Time' },
  { key:'clientFirm', label:'Client Firm' },
  { key:'consultantEmail', label:'Consultant Email', list:'qh-consult-email' },
  { key:'transport', label:'Mode of Transport' },
  { key:'validity', label:'Validity', readOnly:true },
  { key:'clientEmail', label:'Client Email' },
  { key:'architect', label:'Architect / Designer' },
  { key:'siteAddress', label:'Site Address', textarea:true },
  { key:'billingAddress', label:'Billing Address', textarea:true },
];

const TERMS = [
  { text: 'Quotation valid for 30 days from date of issue.' },
  { text: '80% Advance against order confirmation. Balance 20% before delivery.' },
  { text: 'Payment via Cheque / DD / Transfer in favor of SK Marketing Tiles And Tapz.' },
  { text: 'Products once booked cannot be returned, exchanged or cancelled.' },
  { text: 'All disputes subject to Hyderabad, Telangana jurisdiction only.' },
  { text: 'Delivery 40–60 working days from drawing confirmation.' },
  { text: 'Products delivered from Factory @ Jadcherla; local transport extra.' },
  { text: 'Natural stones have 15–20% variation in color & size.' },
  { text: 'Complaints within 24 hours of delivery.' },
  { text: 'Stone can only be installed on a cement-plastered wall.' },
  { text: 'Transit damage margin of 5–7% is acceptable within industry norms.' },
  { text: 'If material is ready for dispatch, the client must issue full payment.', hl: true },
  { text: 'Celestile will hold ready material for only 15 days; beyond which 2% of bill value/month storage applies.', hl: true },
];

export default function HyderabadForm({ initialRef = '' }) {
  const [header, setHeader] = useState({
    quoteDate: todayISO(), refNo: '', clientName:'', clientFirm:'', consultant:'', consultantNo:'', consultantEmail:'',
    architect:'', clientContact:'', clientEmail:'', boutique:'Shamshabad, Hyderabad',
    paymentTerms:'80% Advance, 20% Before Delivery', leadTime:'60 Working Days', transport:'Road',
    validity:'', billingAddress:'', siteAddress:'', status:'',
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

  // Item + thickness come from the team's master sheet; `addFor` remembers
  // which row opened the "+ Add new item" dialog so the new name lands there.
  const master = useQuotationMaster();
  const [addFor, setAddFor] = useState(null);
  const matOptions = master.items.length ? master.items : MATERIAL_LIST;

  const setH = (k, v) => setHeader((h) => ({ ...h, [k]: v }));
  const setC = (k, v) => setCharges((c) => ({ ...c, [k]: v }));
  const calc = useMemo(() => compute(stoneRows, fixRows, charges), [stoneRows, fixRows, charges]);

  useEffect(() => {
    fetch('/api/quotations/next-ref?branch=hyderabad').then((r) => r.json())
      .then((d) => setHeader((h) => ({ ...h, refNo: d.refNo || 'HQ-001' }))).catch(() => {});
    fetch('/api/consultants').then((r) => r.json())
      .then((d) => setConsultants(Array.isArray(d?.list) ? d.list : [])).catch(() => {});
    setHeader((h) => ({ ...h, validity: validityFrom(h.quoteDate) }));
    if (initialRef) loadRef(initialRef);
  }, []);

  /* stone rows */
  const setStone = (i, k, v) => setStoneRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addStone = () => setStoneRows((rs) => [...rs, blankStone()]);
  const delStone = (i) => setStoneRows((rs) => rs.length === 1 ? [blankStone()] : rs.filter((_, idx) => idx !== i));
  async function handleImg(i, file, inputEl) {
    if (!file) return;
    try { setStone(i, 'img', await fileToThumbnail(file)); } catch { /* ignore */ }
    try { if (inputEl) inputEl.value = ''; } catch { /* iOS Safari: file input .value = '' throws */ }
  }
  /* fixing rows */
  const setFix = (i, k, v) => setFixRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addFix = () => setFixRows((rs) => [...rs, { desc:'', mat:'', size:'', unit:'', price:'', qty:'', slab:false }]);
  const delFix = (i) => setFixRows((rs) => rs.filter((_, idx) => idx !== i));
  // Picking a stone from the dropdown pulls its rate straight from the rate
  // card — no manual typing/lookup needed.
  function setFixDesc(i, desc) {
    const preset = FIXING_RATE_CARD.find((f) => f.name === desc);
    setFixRows((rs) => rs.map((r, idx) => idx === i
      ? { ...r, desc, ...(preset ? { price: preset.rate, slab: true, mat: 'Wall Fixing', size: '100 SFT', unit: 'SFT' } : {}) }
      : r));
  }

  function onConsultantBlur() {
    const c = consultants.find((x) => x.name.toLowerCase() === header.consultant.trim().toLowerCase());
    if (c) setHeader((h) => ({ ...h, consultantNo: h.consultantNo || c.mobile, consultantEmail: h.consultantEmail || c.email }));
  }

  async function save() {
    const activeStoneRows = stoneRows.filter((r) => r.desc || Number(r.price) || Number(r.qty) || r.module);
    if (activeStoneRows.some((r) => !r.img)) {
      setStatus('❌ Please add an image for every item before saving.');
      return;
    }
    setSaving(true); setStatus('Saving…');
    const payload = {
      branch: 'hyderabad', refNo: header.refNo, quoteDate: header.quoteDate,
      clientName: header.clientName, clientFirm: header.clientFirm, consultant: header.consultant,
      consultantNo: header.consultantNo, consultantEmail: header.consultantEmail, architect: header.architect,
      clientContact: header.clientContact, clientEmail: header.clientEmail, boutique: header.boutique,
      paymentTerms: header.paymentTerms, validity: header.validity, leadTime: header.leadTime, transport: header.transport,
      billingAddress: header.billingAddress, siteAddress: header.siteAddress,
      discountPct: charges.discountPct, designFees: charges.designFees,
      installationCharges: charges.installationCharges, packingCharges: charges.packingCharges,
      grandTotal: inr2(calc.grandTotal),
      stoneItems: activeStoneRows,
      fixingItems: fixRows.filter((r) => Number(r.qty) > 0),
    };
    try {
      const res = await fetch('/api/quotations', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const d = await res.json();
      if (!res.ok || d.status === 'error') throw new Error(d.message || 'Save failed');
      const isRev = String(header.refNo).toUpperCase().includes('-REV');
      setStatus('✅ Saved (' + d.refNo + ')' + (isRev ? '' : ' — Approval WhatsApp sent'));
      setH('status', 'pending');
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
  const loadSelected = () => loadRef(selRef);
  async function loadRef(ref) {
    if (!ref) return;
    setShowRevise(false); setStatus('Loading…');
    try {
      const q = await (await fetch('/api/quotations?branch=hyderabad&ref=' + encodeURIComponent(ref))).json();
      if (q.error) throw new Error(q.error);
      setHeader((h) => ({
        ...h, refNo: nextRevRef(q.refNo), clientName: q.clientName || '', clientFirm: q.clientFirm || '',
        consultant: q.consultant || '', consultantNo: q.consultantNo || q.consultantNumber || '', consultantEmail: q.consultantEmail || '',
        architect: q.architect || '', clientContact: q.clientContact || q.contact || '', clientEmail: q.clientEmail || q.email || '',
        boutique: q.boutique || h.boutique, paymentTerms: q.paymentTerms || h.paymentTerms, validity: q.validity || h.validity,
        leadTime: q.leadTime || h.leadTime, transport: q.transport || h.transport,
        billingAddress: q.billingAddress || '', siteAddress: q.siteAddress || '',
        status: '', // revising always starts a fresh draft that needs its own approval
      }));
      setCharges({ discountPct: q.discountPct || '0', designFees: q.designFees || '0',
        installationCharges: q.installationCharges || '0', packingCharges: q.packingCharges || '0' });
      const items = Array.isArray(q.stoneItems) ? q.stoneItems : [];
      setStoneRows(items.length ? items.map((it) => ({ ...blankStone(), ...it, module: !!it.module, gst: it.gst ?? DEFAULT_GST })) : [blankStone()]);
      const fix = Array.isArray(q.fixingItems) ? q.fixingItems : [];
      setFixRows(fix.length ? fix.map((f) => ({ desc: f.desc || f.col1 || '', mat: f.mat || '', size: f.size || '', unit: f.unit || '', price: f.price || '', qty: f.qty || '', slab: !!f.slab })) : []);
      setStatus('Loaded ' + q.refNo + ' → revising as ' + nextRevRef(q.refNo));
    } catch (e) { setStatus('❌ ' + e.message); }
  }

  function reset() {
    setHeader((h) => ({ ...h, clientName:'', clientFirm:'', consultant:'', consultantNo:'', consultantEmail:'', architect:'',
      clientContact:'', clientEmail:'', billingAddress:'', siteAddress:'', boutique:'Shamshabad, Hyderabad',
      paymentTerms:'80% Advance, 20% Before Delivery', leadTime:'60 Working Days', transport:'Road',
      quoteDate: todayISO(), validity: validityFrom(todayISO()), status:'' }));
    setCharges({ discountPct:'0', designFees:'0', installationCharges:'0', packingCharges:'0' });
    setStoneRows(Array.from({ length: 3 }, blankStone));
    setFixRows(DEFAULT_FIXING.map((f) => ({ ...f })));
    fetch('/api/quotations/next-ref?branch=hyderabad').then((r) => r.json()).then((d) => setH('refNo', d.refNo || 'HQ-001')).catch(() => {});
    setStatus('');
  }

  return (
    <div className="qh-scope">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Jost:wght@300;400;500;600;700&display=swap" />
      <datalist id="qh-consult">{consultants.map((c) => <option key={c.name} value={c.name} />)}</datalist>
      <datalist id="qh-consult-email">{consultants.map((c) => c.email && <option key={c.email} value={c.email} />)}</datalist>
      <datalist id="qh-thk">{master.thicknesses.map((t) => <option key={t} value={t} />)}</datalist>

      {addFor !== null && (
        <AddItemModal
          thicknesses={master.thicknesses}
          onAdd={master.addItem}
          onClose={(name) => { if (name) setStone(addFor, 'mat', name); setAddFor(null); }}
        />
      )}
      {master.error && (
        <div className="qh-master-warn">⚠ Item master: {master.error}</div>
      )}

      <div className="qh-toolbar">
        <div className="qh-toolbar-left">
          <div className="qh-toolbar-title">Quotation — Hyderabad</div>
          <div className="qh-toolbar-ref">REF: {header.refNo || '—'}</div>
        </div>
        <div className="qh-tbtn-group">
          {status && <span className="qh-status-text">{status}</span>}
          <button className="qh-tbtn" onClick={reset}>↺ Reset</button>
          <button className="qh-tbtn" onClick={openRevise}>Revise</button>
          <button className="qh-tbtn qh-tbtn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : '💾 Save'}</button>
        </div>
      </div>

      <div className="qh-container">
        <div className="qh-doc-header">
          <div className="qh-header-top">
            <div className="qh-header-left">
              <img className="qh-header-mark" src={CELESTILE_MARK_RED} alt="" />
              <img className="qh-header-logo" src={CELESTILE_LOGO_FULL} alt="Celestile" />
              <div>
                <div className="qh-brand-name">CELESTILE</div>
                <div className="qh-brand-tagline">Hyderabad Boutique</div>
              </div>
            </div>
            <div className="qh-doc-type-block">
              <div className="qh-doc-type">QUOTATION</div>
              <div className="qh-ref-badge">REF: {header.refNo || '—'}</div>
            </div>
          </div>
          <div className="qh-gold-rule" />
        </div>

        <div className="qh-info-section">
          <div className="qh-info-grid">
            {FIELD_ORDER.map((f) => (
              <div className="qh-info-field" key={f.key}>
                <label>{f.label}</label>
                {f.textarea
                  ? <textarea rows={1} value={header[f.key]} onChange={(e) => setH(f.key, e.target.value)} />
                  : <input type={f.type || 'text'} list={f.list} readOnly={f.readOnly}
                      value={f.key === 'quoteDate' ? header.quoteDate : header[f.key]}
                      onBlur={f.useOnBlur ? onConsultantBlur : undefined}
                      onChange={f.key === 'quoteDate'
                        ? (e) => setHeader((h) => ({ ...h, quoteDate: e.target.value, validity: validityFrom(e.target.value) }))
                        : (e) => setH(f.key, e.target.value)} />}
              </div>
            ))}
          </div>
        </div>

        <div className="qh-body-content">
          <div className="qh-section-header">
            <div className="qh-section-num">01</div>
            <div className="qh-section-label">Stone &amp; Tile Items</div>
            <div className="qh-section-rule" />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="qh-items-table">
              <colgroup>
                <col style={{ width: 24 }} /><col style={{ width: 46 }} /><col style={{ width: 130 }} /><col style={{ width: 48 }} />
                <col style={{ width: 46 }} /><col style={{ width: 46 }} /><col style={{ width: 90 }} /><col style={{ width: 60 }} />
                <col style={{ width: 62 }} /><col style={{ width: 52 }} /><col style={{ width: 64 }} /><col style={{ width: 44 }} />
                <col style={{ width: 46 }} /><col style={{ width: 72 }} /><col style={{ width: 24 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th><th>Img</th><th>Description</th><th>Area</th><th>Wt (in)</th><th>Ht (in)</th><th>Material</th>
                  <th>Thickness</th><th>Unit</th><th>Rate Type</th><th>Rate (₹)</th><th>Qty</th><th>GST %</th>
                  <th style={{ textAlign: 'right' }}>Amount</th><th></th>
                </tr>
              </thead>
              <tbody>
                {stoneRows.map((r, i) => {
                  const eff = calc.perStone[i] || { amt: 0, q: 0, hasInput: false };
                  const needsImage = !r.img && (r.desc || Number(r.price) || Number(r.qty) || r.module);
                  return (
                    <tr key={i} className={i % 2 === 1 ? 'qh-row-even' : ''}>
                      <td className="qh-sno-cell">{i + 1}</td>
                      <td className="qh-img-cell">
                        {r.img ? (
                          <div className="qh-img-wrap">
                            <ZoomImg className="qh-img-preview-thumb" src={r.img} />
                            <label className="qh-img-change" title="Replace image">
                              ✎
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImg(i, e.target.files[0], e.target)} />
                            </label>
                          </div>
                        ) : (
                          <label className="qh-img-container">
                            <div className={`qh-img-placeholder ${needsImage ? 'qh-img-required' : ''}`}>+</div>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImg(i, e.target.files[0], e.target)} />
                          </label>
                        )}
                      </td>
                      <td><input value={r.desc} placeholder="Description" onChange={(e) => setStone(i, 'desc', e.target.value)} /></td>
                      <td><input value={r.area} placeholder="—" onChange={(e) => setStone(i, 'area', e.target.value)} /></td>
                      <td><input value={r.sizeWt} placeholder="Wt" onChange={(e) => setStone(i, 'sizeWt', e.target.value)} /></td>
                      <td><input value={r.sizeHt} placeholder="Ht" onChange={(e) => setStone(i, 'sizeHt', e.target.value)} /></td>
                      <td>
                        <select value={r.mat} onChange={(e) => {
                          if (e.target.value === ADD_ITEM_VALUE) { setAddFor(i); return; }
                          setStone(i, 'mat', e.target.value);
                        }}>
                          <option value="">—</option>
                          {r.mat && !matOptions.includes(r.mat) && <option value={r.mat}>{r.mat}</option>}
                          {matOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                          <option value={ADD_ITEM_VALUE}>＋ Add new item…</option>
                        </select>
                      </td>
                      <td>
                        <input list="qh-thk" value={r.thk} placeholder="Thk" onChange={(e) => setStone(i, 'thk', e.target.value)} />
                      </td>
                      <td>
                        <select value={r.unit} onChange={(e) => setStone(i, 'unit', e.target.value)}>
                          {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u || '—'}</option>)}
                        </select>
                      </td>
                      <td className="qh-rate-type-cell">
                        <label className="qh-rate-type-toggle" title="SFT: qty = Wt × Ht">
                          <input type="checkbox" checked={r.module} onChange={(e) => setStone(i, 'module', e.target.checked)} />
                          <span>SFT</span>
                        </label>
                      </td>
                      <td><CalcInput className="qh-num-input" value={r.price} onChange={(v) => setStone(i, 'price', v)} title="Type a formula, e.g. 2850*45" /></td>
                      <td>
                        {r.module
                          ? <input className="qh-num-input qh-readonly-qty" readOnly value={eff.q ? +Number(eff.q).toFixed(2) : ''} />
                          : <CalcInput className="qh-num-input" value={r.qty} onChange={(v) => setStone(i, 'qty', v)} title="Type a formula, e.g. 2850*45" />}
                      </td>
                      <td><CalcInput className="qh-num-input" value={r.gst} onChange={(v) => setStone(i, 'gst', v)} /></td>
                      <td className="qh-amt-cell">{eff.hasInput ? inr2(eff.amt) : ''}</td>
                      <td><button className="qh-del-btn" onClick={() => delStone(i)}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="qh-add-row-btn" onClick={addStone}>+ Add Stone Item</button>

          <div className="qh-section-header">
            <div className="qh-section-num">02</div>
            <div className="qh-section-label">Fixing Material</div>
            <div className="qh-section-rule" />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="qh-items-table">
              <colgroup>
                <col style={{ width: 24 }} /><col style={{ width: 220 }} /><col style={{ width: 100 }} />
                <col style={{ width: 90 }} /><col style={{ width: 90 }} /><col style={{ width: 24 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th><th>Description</th><th>Rate (₹)</th><th>Qty / SFT</th><th style={{ textAlign: 'right' }}>Amount</th><th></th>
                </tr>
              </thead>
              <tbody>
                {fixRows.map((r, i) => {
                  const amt = fixAmount(r);
                  return (
                    <tr key={i} className={i % 2 === 1 ? 'qh-row-even' : ''}>
                      <td className="qh-sno-cell">{i + 1}</td>
                      <td>
                        <select value={r.desc} onChange={(e) => setFixDesc(i, e.target.value)}>
                          <option value="">Select material…</option>
                          {FIXING_RATE_CARD.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                        </select>
                      </td>
                      <td><CalcInput className="qh-num-input" value={r.price} onChange={(v) => setFix(i, 'price', v)} title="Type a formula, e.g. 2850*45" /></td>
                      <td><CalcInput className="qh-num-input" value={r.qty} onChange={(v) => setFix(i, 'qty', v)} title={r.slab ? 'Enter total SFT — billed in 100 SFT blocks' : 'Qty'} /></td>
                      <td className="qh-amt-cell">{amt ? inr2(amt) : '₹ 0.00'}</td>
                      <td><button className="qh-del-btn" onClick={() => delFix(i)}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="qh-add-row-btn" onClick={addFix}>+ Add Fixing Item</button>

          <div className="qh-bottom-grid">
            <div className="qh-bank-panel">
              <div className="qh-bank-title">Bank Details</div>
              <div className="qh-bank-row"><span className="qh-bank-key">Name</span><span className="qh-bank-val">S K Marketing Tiles &amp; Tapz</span></div>
              <div className="qh-bank-row"><span className="qh-bank-key">Account No.</span><span className="qh-bank-val">8008002700</span></div>
              <div className="qh-bank-row"><span className="qh-bank-key">Bank</span><span className="qh-bank-val">Kotak Mahindra Bank</span></div>
              <div className="qh-bank-row"><span className="qh-bank-key">Branch</span><span className="qh-bank-val">Srinagar Colony</span></div>
              <div className="qh-bank-row"><span className="qh-bank-key">IFSC Code</span><span className="qh-bank-val">KKBK0007488</span></div>
              <div className="qh-bank-row"><span className="qh-bank-key">UPI ID</span><span className="qh-bank-val">celestile@kotak</span></div>
            </div>

            <div className="qh-totals-panel">
              <div className="qh-total-row"><span className="qh-label">Basic Sale Value (Stone)</span><span className="qh-value">{inr2(calc.stoneSum)}</span></div>
              <div className="qh-total-row">
                <span className="qh-label">Design Fees</span>
                <div className="qh-total-input-wrap"><span>₹</span><CalcInput className="qh-total-input" value={charges.designFees} onChange={(v) => setC('designFees', v)} /></div>
              </div>
              <div className="qh-total-row qh-discount-row">
                <span className="qh-label">Discount</span>
                <div className="qh-total-input-wrap">
                  <CalcInput className="qh-total-input" style={{ width: 40 }} value={charges.discountPct} onChange={(v) => setC('discountPct', v)} />
                  <span>%</span>
                  <span style={{ marginLeft: 8, whiteSpace: 'nowrap' }}>{inrNeg(calc.discAmt)}</span>
                </div>
              </div>
              {calc.discAmt > 0 && <div className="qh-total-row qh-subtotal-row"><span className="qh-label">Net Stone Value</span><span className="qh-value">{inr2(calc.netStone)}</span></div>}
              <div className="qh-total-row"><span className="qh-label">Fixing Material Total</span><span className="qh-value">{inr2(calc.fixSum)}</span></div>
              <div className="qh-total-row">
                <span className="qh-label">Packing Charges</span>
                <div className="qh-total-input-wrap"><span>₹</span><CalcInput className="qh-total-input" value={charges.packingCharges} onChange={(v) => setC('packingCharges', v)} /></div>
              </div>
              <div className="qh-total-row"><span className="qh-label">GST (Total)</span><span className="qh-value">{inr2(calc.totalGst)}</span></div>
              <div className="qh-total-row qh-subtotal-row"><span className="qh-label">Stone Total (Incl. GST)</span><span className="qh-value">{inr2(calc.swg)}</span></div>
              <div className="qh-total-row">
                <span className="qh-label">Installation Charges</span>
                <div className="qh-total-input-wrap"><span>₹</span><CalcInput className="qh-total-input" value={charges.installationCharges} onChange={(v) => setC('installationCharges', v)} /></div>
              </div>
              <div className="qh-total-row qh-grand">
                <span className="qh-label">Grand Total</span>
                <span className="qh-value">{inr2(calc.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="qh-terms-section">
          <div className="qh-terms-title">Terms &amp; Conditions</div>
          <ul className="qh-terms-columns">
            {TERMS.map((t, i) => <li key={i} className={t.hl ? 'qh-term-hl' : ''}>{t.text}</li>)}
          </ul>
        </div>

        <div className="qh-sig-section">
          <div className="qh-sig-block"><div className="qh-sig-line" /><div className="qh-sig-label">Agreed by Client / Signature</div></div>
          <div className="qh-sig-block"><div className="qh-sig-line" /><div className="qh-sig-label">For Celestile / Authorized Signatory</div></div>
        </div>

        <div className="qh-doc-footer">
          <p>Celestile · The Home &amp; Bath Boutique<span className="qh-sep">|</span>www.celestile.com</p>
          <p>SHAMSHABAD, HYDERABAD: +91 800 800 2700<span className="qh-sep">|</span>SARJAPUR ROAD, BANGALORE: +91 080 2665 8884</p>
        </div>
      </div>

      {showRevise && (
        <div className="qh-modal" onClick={() => setShowRevise(false)}>
          <div className="qh-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Load Quotation</h3>
            <select value={selRef} onChange={(e) => setSelRef(e.target.value)}>
              {reviseList.length === 0 && <option value="">No saved quotations</option>}
              {reviseList.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="qh-tbtn qh-tbtn-primary" style={{ flex: 1 }} disabled={!selRef} onClick={loadSelected}>Load</button>
              <button className="qh-tbtn" onClick={() => setShowRevise(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .qh-scope {
          --qh-blue:#22409A; --qh-blue-light:#3a5bc0; --qh-gold:#b08d57; --qh-gold-light:#d4b483; --qh-gold-dark:#8a6d3b;
          --qh-cream:#faf7f2; --qh-cream-dark:#e8dece; --qh-border:#d9cfc0;
          --qh-text:#2a2218; --qh-muted:#7a6e60; --qh-beige:#ede5d3;
          font-family:'Jost',sans-serif;
        }
        .qh-toolbar{background:var(--qh-blue);border-radius:10px;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;}
        .qh-toolbar-title{color:var(--qh-gold-light);font-family:'Cormorant Garamond',serif;font-size:1.05rem;font-weight:600;letter-spacing:1px;}
        .qh-toolbar-ref{color:rgba(212,180,131,0.65);font-size:0.72rem;letter-spacing:1px;margin-top:2px;font-family:Arial,sans-serif;}
        .qh-tbtn-group{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
        .qh-status-text{color:var(--qh-gold-light);font-size:0.75rem;margin-right:6px;}
        .qh-tbtn{padding:7px 16px;border-radius:2px;border:1px solid rgba(176,141,87,0.4);background:transparent;color:#c9d2ea;cursor:pointer;font-family:'Jost',sans-serif;font-size:0.72rem;letter-spacing:1.2px;text-transform:uppercase;transition:all 0.2s;}
        .qh-tbtn:hover{background:rgba(176,141,87,0.15);border-color:var(--qh-gold);}
        .qh-tbtn:disabled{opacity:0.4;cursor:not-allowed;}
        .qh-tbtn-primary{background:linear-gradient(135deg,#b08d57,#8a6d3b);color:#fff1da;border:none;font-weight:600;}
        .qh-tbtn-primary:hover{background:linear-gradient(135deg,#c4a06b,#9a7d4b);}

        .qh-container{background:#fff;box-shadow:0 8px 40px rgba(30,45,100,0.14),0 0 0 1px rgba(176,141,87,0.18);}

        .qh-doc-header{background:var(--qh-blue);padding:24px 36px 22px;position:relative;overflow:hidden;border-bottom:3px solid var(--qh-gold);}
        .qh-doc-header::before{content:'';position:absolute;top:-60px;right:-60px;width:240px;height:240px;border:1px solid rgba(176,141,87,0.14);border-radius:50%;pointer-events:none;}
        .qh-header-top{display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1;flex-wrap:wrap;gap:12px;}
        .qh-header-left{display:flex;align-items:center;gap:18px;}
        .qh-header-logo{height:64px;width:auto;border-radius:6px;box-shadow:0 0 0 1px rgba(176,141,87,0.5),0 4px 14px rgba(0,0,0,0.3);object-fit:contain;flex-shrink:0;}
        .qh-header-mark{width:48px;height:48px;background:#fff;border-radius:6px;padding:4px;box-shadow:0 0 0 1px rgba(176,141,87,0.5),0 4px 14px rgba(0,0,0,0.3);object-fit:contain;flex-shrink:0;}
        .qh-brand-name{font-family:'Cormorant Garamond',serif;font-size:2.2rem;font-weight:400;color:var(--qh-gold-light);letter-spacing:7px;line-height:1;}
        .qh-brand-tagline{font-size:0.6rem;letter-spacing:4.5px;text-transform:uppercase;color:rgba(212,180,131,0.85);margin-top:6px;}
        .qh-doc-type-block{text-align:right;}
        .qh-doc-type{font-family:'Cormorant Garamond',serif;font-size:1.5rem;font-weight:500;color:var(--qh-gold-light);letter-spacing:5px;}
        .qh-ref-badge{background:rgba(176,141,87,0.16);border:1px solid rgba(176,141,87,0.5);padding:5px 14px;font-size:0.7rem;letter-spacing:2px;color:rgba(232,218,196,0.9);margin-top:8px;display:inline-block;font-family:Arial,sans-serif;}
        .qh-gold-rule{height:1px;background:linear-gradient(90deg,transparent,rgba(176,141,87,0.75),transparent);margin:18px 0 0;}

        .qh-info-section{padding:20px 36px;background:var(--qh-cream);border-bottom:1px solid var(--qh-border);}
        .qh-info-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 20px;}
        .qh-info-field label{display:block;font-size:0.68rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--qh-muted);margin-bottom:5px;}
        .qh-info-field input,.qh-info-field textarea{width:100%;border:1px solid var(--qh-border);border-radius:5px;background:rgba(34,64,154,0.035);outline:none;padding:7px 9px;font-family:'Jost',sans-serif;font-size:0.9rem;color:var(--qh-text);font-weight:500;resize:none;transition:background .15s,box-shadow .15s;}
        .qh-info-field input:focus,.qh-info-field textarea:focus{background:#fff;box-shadow:0 0 0 1px var(--qh-gold);}
        .qh-info-field input::placeholder,.qh-info-field textarea::placeholder{color:#a89e90;font-weight:300;}
        .qh-info-field input[readonly]{background:rgba(34,64,154,0.07);color:var(--qh-muted);}

        .qh-body-content{padding:24px 36px;}
        .qh-section-header{display:flex;align-items:center;gap:12px;margin:20px 0 10px;}
        .qh-section-header:first-child{margin-top:0;}
        .qh-section-num{width:24px;height:24px;border-radius:50%;background:var(--qh-blue);color:var(--qh-gold-light);font-size:0.7rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:Arial,sans-serif;}
        .qh-section-label{font-family:'Cormorant Garamond',serif;font-size:1rem;font-weight:600;letter-spacing:2px;color:var(--qh-blue);text-transform:uppercase;}
        .qh-section-rule{flex:1;height:1px;background:var(--qh-border);}

        .qh-items-table{width:100%;border-collapse:collapse;font-size:0.85rem;table-layout:fixed;}
        .qh-items-table thead tr{background:var(--qh-blue);}
        .qh-items-table th{padding:9px 4px;color:rgba(220,228,245,0.92);font-weight:500;letter-spacing:1px;font-size:0.62rem;text-transform:uppercase;text-align:left;}
        .qh-items-table tbody tr{border-bottom:1px solid var(--qh-cream-dark);}
        .qh-items-table tbody tr.qh-row-even{background:var(--qh-cream);}
        .qh-items-table td{padding:6px 3px;vertical-align:middle;}
        .qh-items-table td input,.qh-items-table td select{width:100%;border:1px solid transparent;border-radius:4px;background:rgba(34,64,154,0.035);outline:none;padding:4px 5px;font-family:'Jost',sans-serif;font-size:0.83rem;color:var(--qh-text);transition:background .15s,box-shadow .15s;}
        .qh-items-table td input:focus,.qh-items-table td select:focus{background:#fff;box-shadow:0 0 0 1px var(--qh-gold);}
        .qh-num-input{text-align:right;font-family:Arial,sans-serif !important;font-size:0.85rem !important;}
        .qh-readonly-qty{background:rgba(34,64,154,0.08) !important;color:var(--qh-muted) !important;}
        .qh-sno-cell{width:24px;text-align:center;font-weight:700;font-size:0.8rem;color:var(--qh-muted);font-family:Arial,sans-serif;}
        .qh-amt-cell{text-align:right;font-weight:600;color:var(--qh-text);white-space:nowrap;font-family:Arial,sans-serif;font-size:0.85rem;}
        .qh-del-btn{background:none;border:none;cursor:pointer;color:#ccc;font-size:0.75rem;padding:2px 6px;}
        .qh-del-btn:hover{color:#c0392b;}
        .qh-add-row-btn{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:5px 14px;border:1px dashed rgba(34,64,154,0.35);background:transparent;color:var(--qh-blue);font-family:'Jost',sans-serif;font-size:0.7rem;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;}
        .qh-add-row-btn:hover{background:rgba(34,64,154,0.06);border-color:var(--qh-blue);}

        .qh-master-warn{margin:0 0 10px;padding:6px 10px;border:1px solid #f0d090;background:#fdf6e3;color:#8a6100;font-family:Arial,sans-serif;font-size:0.72rem;}
        @media print { .qh-master-warn{display:none;} }

        .qh-img-cell{width:46px;}
        .qh-img-container{width:38px;height:38px;display:block;cursor:pointer;}
        .qh-img-placeholder{width:38px;height:38px;border:1px dashed rgba(34,64,154,0.3);background:rgba(34,64,154,0.04);display:flex;align-items:center;justify-content:center;color:rgba(34,64,154,0.45);font-size:1.05rem;}
        .qh-img-placeholder.qh-img-required{border:1px dashed #c0392b;background:rgba(192,57,43,0.06);color:#c0392b;}
        .qh-img-preview-thumb{width:38px;height:38px;object-fit:cover;border:1px solid var(--qh-border);cursor:zoom-in;}
        /* Thumb is click-to-enlarge, so replacing the image moved to this badge. */
        .qh-img-wrap{position:relative;width:38px;height:38px;}
        .qh-img-change{position:absolute;right:-5px;bottom:-5px;width:15px;height:15px;border-radius:50%;background:#fff;border:1px solid var(--qh-border);color:var(--qh-blue);font-size:8px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.18);}
        .qh-img-change:hover{background:var(--qh-cream);}

        .qh-rate-type-cell{text-align:center;}
        .qh-rate-type-toggle{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;font-size:0.54rem;color:var(--qh-muted);letter-spacing:1px;text-transform:uppercase;font-weight:600;}
        .qh-rate-type-toggle input{margin:0;width:14px;height:14px;cursor:pointer;accent-color:var(--qh-blue);}

        .qh-bottom-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:20px;margin-top:24px;}
        .qh-bank-panel{background:var(--qh-cream);border:1px solid var(--qh-border);padding:16px 18px;}
        .qh-bank-title{font-family:'Cormorant Garamond',serif;font-size:0.85rem;font-weight:600;letter-spacing:2px;color:var(--qh-blue);text-transform:uppercase;margin-bottom:12px;border-bottom:1px solid var(--qh-border);padding-bottom:8px;}
        .qh-bank-row{display:flex;gap:10px;padding:5px 0;border-bottom:1px solid rgba(217,207,192,0.5);font-size:0.82rem;}
        .qh-bank-key{width:90px;flex-shrink:0;color:var(--qh-muted);font-weight:500;}
        .qh-bank-val{color:var(--qh-text);font-weight:600;font-family:Arial,sans-serif;}

        .qh-totals-panel{border:1px solid var(--qh-border);overflow:hidden;height:fit-content;}
        .qh-total-row{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--qh-cream-dark);font-size:0.86rem;gap:8px;}
        .qh-label{color:var(--qh-muted);}
        .qh-value{font-weight:600;color:var(--qh-text);white-space:nowrap;font-family:Arial,sans-serif;font-size:0.9rem;}
        .qh-subtotal-row{background:rgba(34,64,154,0.045);}
        .qh-discount-row .qh-label,.qh-discount-row span{color:#9a3a1f;}
        .qh-total-row.qh-grand{background:var(--qh-beige);padding:12px 14px;border-bottom:none;border-top:2px solid rgba(176,141,87,0.4);}
        .qh-total-row.qh-grand .qh-label{color:#5a4a30;font-size:0.76rem;letter-spacing:1px;text-transform:uppercase;}
        .qh-total-row.qh-grand .qh-value{color:var(--qh-blue);font-size:1.15rem;font-family:Arial,sans-serif;font-weight:700;}
        .qh-total-input{border:1px solid var(--qh-border);border-radius:4px;background:rgba(34,64,154,0.05);outline:none;padding:3px 6px;font-family:Arial,sans-serif;font-size:0.88rem;font-weight:600;color:var(--qh-text);width:74px;text-align:right;transition:background .15s,box-shadow .15s;}
        .qh-total-input:focus{background:#fff;box-shadow:0 0 0 1px var(--qh-gold);}
        .qh-total-input-wrap{display:flex;align-items:center;gap:4px;}

        .qh-terms-section{padding:24px 36px;background:var(--qh-cream);border-top:1px solid var(--qh-border);}
        .qh-terms-title{font-family:'Cormorant Garamond',serif;font-size:0.9rem;font-weight:600;letter-spacing:2px;color:var(--qh-blue);text-transform:uppercase;margin-bottom:14px;}
        .qh-terms-columns{columns:2;gap:28px;list-style:none;margin:0;padding:0;}
        .qh-terms-columns li{font-size:0.76rem;color:var(--qh-muted);line-height:1.55;margin-bottom:6px;padding-left:12px;position:relative;break-inside:avoid;}
        .qh-terms-columns li::before{content:'—';position:absolute;left:0;color:var(--qh-gold-light);}
        .qh-terms-columns li.qh-term-hl{color:var(--qh-text);font-weight:700;}

        .qh-sig-section{padding:20px 36px;display:flex;gap:40px;}
        .qh-sig-block{flex:1;}
        .qh-sig-line{height:44px;border-bottom:1px solid var(--qh-border);margin-bottom:6px;}
        .qh-sig-label{font-size:0.65rem;letter-spacing:2px;text-transform:uppercase;color:var(--qh-muted);}

        .qh-doc-footer{background:var(--qh-blue);padding:14px 36px;text-align:center;border-top:3px solid var(--qh-gold);}
        .qh-doc-footer p{font-size:0.63rem;letter-spacing:1.5px;color:rgba(212,180,131,0.85);text-transform:uppercase;line-height:1.8;margin:0;}
        .qh-sep{margin:0 10px;color:rgba(176,141,87,0.4);}

        .qh-modal{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:50;backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:40px 16px;}
        .qh-modal-box{background:#fff;width:340px;max-width:92%;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,0.25);}
        .qh-modal-box h3{font-family:'Cormorant Garamond',serif;font-size:1.2rem;color:var(--qh-blue);letter-spacing:1.5px;margin-bottom:14px;}
        .qh-modal-box select{width:100%;padding:9px;margin-top:6px;border:1px solid var(--qh-border);background:var(--qh-cream);font-family:'Jost',sans-serif;font-size:0.8rem;outline:none;}

        @media (max-width: 860px) {
          .qh-info-grid{grid-template-columns:repeat(2,1fr);}
          .qh-bottom-grid{grid-template-columns:1fr;}
          .qh-terms-columns{columns:1;}
        }
      `}</style>
    </div>
  );
}

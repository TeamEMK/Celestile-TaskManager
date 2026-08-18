'use client';
import { useEffect, useMemo, useState } from 'react';
import { CELESTILE_LOGO, CELESTILE_MARK_RED } from '@/lib/celestile-logo';
import { fileToThumbnail } from './imageThumb';
import { CalcInput } from './calcExpr';
import { ZoomImg } from '@/app/components/ImageLightbox';
import { useQuotationMaster, AddItemModal, ADD_ITEM_VALUE } from './useQuotationMaster';
import Icon from '../components/Icon';

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

// Flat field order — mirrors the Apps Script tool's info-grid exactly (a plain
// 4-column CSS grid with no filler cells, so the 15 fields wrap unevenly).
const FIELD_ORDER = [
  { key:'quoteDate', label:'Date', type:'date' },
  { key:'architectName', label:'Architect Name', placeholder:'Architect name' },
  { key:'refNo', label:'Quotation Ref. No.', readOnly:true },
  { key:'boutique', label:'Boutique' },
  { key:'clientName', label:'Client Name', placeholder:'Enter client name' },
  { key:'architectFirm', label:'Architect Firm', placeholder:'Firm / Company name' },
  { key:'consultant', label:'Consultant', placeholder:'—', list:'bq-consult', useOnBlur:true },
  { key:'clientContact', label:'Client Contact', placeholder:'+91 XXXXX XXXXX' },
  { key:'validity', label:'Validity', readOnly:true },
  { key:'consultantNumber', label:'Consultant Number', placeholder:'+91 XXXXX XXXXX' },
  { key:'clientEmail', label:'Email', placeholder:'email@example.com', type:'email' },
  { key:'siteAddress', label:'Site Address', placeholder:'Project / site address', textarea:true },
  { key:'leadTime', label:'Lead Time' },
  { key:'consultantEmail', label:'Consultant Email', placeholder:'consultant@email.com', type:'email' },
  { key:'billingAddress', label:'Billing Address', placeholder:'Full billing address', textarea:true },
];

const TERMS = [
  "Payment Terms: A 60% advance is required upon order confirmation or booking. The remaining 40% to be paid before delivery.",
  "Order Policy: Once booked, products cannot be returned, exchanged, or cancelled under any circumstances.",
  "Delivery & Transportation: All products are dispatched from our local warehouse. Transportation charges will be applicable based on the delivery location.",
  "Measurement Changes: In case of changes in site measurements during the design stage, the quotation will be revised as per actuals.",
  "Site Visit Charges: Additional charges will apply for site visits outside Bengaluru.",
  "Legal Jurisdiction: Any disputes will fall under the jurisdiction of Bengaluru, Karnataka.",
  "Quotation Validity: This quotation is valid for 30 days from the date of issue.",
  "Product Issues: Any complaints or discrepancies must be reported within 24 hours of delivery, in case installation is not in Celes'tile scope of work.",
  "Packaging Guidelines: If installation is to be carried out by Celes'tile, product boxes must remain sealed and untouched until our team arrives.",
  "Additional Charges: Charges for transportation, loading, unloading, and installation are not included in the quotation and will be billed separately.",
  "Installation Advisory: Celes'tile shall not be liable for damages caused by third-party installers or contractors not appointed by us.",
  "Installation Condition: The stone can be installed only on a cement-plastered wall.",
  "Transit Tolerance: A standard transit damage margin of 5–7% is considered acceptable within industry norms.",
  "Delivery Schedule: The delivery of the material will be processed within 48 hours upon receipt of payment.",
  "Design Iteration: Up to three changes in any drawing can be made without any additional fee.",
  "Design Confirmation: Once the drawings are approved for production, no further changes can be made.",
  "Site Condition: The stone can only be installed on a cement plastered wall, chipping is not in the scope of Celes'tile.",
  "Work Responsibility: Carpentry, Plumbing, Electrical, Fabrication, Scaffolding is not in scope of Celes'tile.",
  "Delivery Timeline: The estimated delivery timeline is 40 to 60 days from the date of order confirmation.",
  "Site Cleaning: Cleaning of debris and wooden boxes from the site is not included in the scope of Celes'tile.",
  "Storage Responsibility: If delivery is completed but installation is delayed due to site unavailability, the client shall be responsible for safe storage.",
  "Studio Timings: Monday–Saturday 9:30 am–7:30 pm, studio is closed on Sundays.",
];

export default function BangaloreForm({ initialRef = '' }) {
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

  // Item + thickness come from the team's master sheet; `addFor` remembers
  // which row opened the "+ Add new item" dialog so the new name lands there.
  const master = useQuotationMaster();
  const [addFor, setAddFor] = useState(null);
  const matOptions = master.items.length ? master.items : MATERIAL_LIST;

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
    const activeRows = rows.filter((r) => r.desc || r.area || Number(r.price) || Number(r.qty));
    if (activeRows.some((r) => !r.img)) {
      setStatus('Please add an image for every item before saving.');
      return;
    }
    setSaving(true); setStatus('Saving…');
    const payload = {
      branch: 'bangalore', refNo: header.refNo, quoteDate: header.quoteDate,
      clientName: header.clientName, architectName: header.architectName, architectFirm: header.architectFirm,
      consultant: header.consultant, consultantNumber: header.consultantNumber, consultantEmail: header.consultantEmail,
      clientContact: header.clientContact, clientEmail: header.clientEmail, boutique: header.boutique,
      validity: header.validity, leadTime: header.leadTime, billingAddress: header.billingAddress, siteAddress: header.siteAddress,
      grandTotal: inr0(calc.grandTotal),
      stoneItems: activeRows,
      totalsConfig: totals,
    };
    try {
      const res = await fetch('/api/quotations', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const d = await res.json();
      if (!res.ok || d.status === 'error') throw new Error(d.message || 'Save failed');
      const isRev = String(header.refNo).toUpperCase().includes('-REV');
      const savedMsg = 'Saved (' + d.refNo + ')' + (isRev ? '' : ' — Approval WhatsApp sent');
      // clear the form for the next quotation, keeping the success message visible
      setHeader((h) => ({ ...h, refNo:'', clientName:'', architectName:'', architectFirm:'', consultant:'', consultantNumber:'',
        consultantEmail:'', clientContact:'', clientEmail:'', billingAddress:'', siteAddress:'',
        boutique:'Sarjapur Road, Bangalore', leadTime:'60 Working Days', quoteDate: todayISO(), validity: validityFrom(todayISO()), status:'' }));
      setRows(Array.from({ length: 5 }, blankRow));
      setTotals(defaultTotals());
      fetch('/api/quotations/next-ref?branch=bangalore').then((r) => r.json()).then((x) => setH('refNo', x.refNo || '001')).catch(() => {});
      setStatus(savedMsg);
    } catch (e) { setStatus(e.message); }
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
    } catch { setStatus('Could not load list'); }
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
    } catch (e) { setStatus(e.message); }
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

  return (
    <div className="qb-scope">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Jost:wght@300;400;500;600;700&display=swap" />
      <datalist id="bq-thk">{master.thicknesses.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="bq-unit">{UNIT_OPTIONS.map((u) => <option key={u} value={u} />)}</datalist>
      <datalist id="bq-consult">{consultants.map((c) => <option key={c.name} value={c.name} />)}</datalist>

      {addFor !== null && (
        <AddItemModal
          thicknesses={master.thicknesses}
          onAdd={master.addItem}
          onClose={(name) => { if (name) setRow(addFor, 'mat', name); setAddFor(null); }}
        />
      )}
      {master.error && (
        <div className="qb-master-warn"><Icon name="alert" className="w-3.5 h-3.5" /> Item master: {master.error}</div>
      )}

      {/* toolbar */}
      <div className="qb-toolbar">
        <div className="qb-toolbar-left">
          <div className="qb-toolbar-title">Quotation — Bangalore</div>
          <div className="qb-toolbar-ref">REF: {header.refNo || '—'}</div>
        </div>
        <div className="qb-tbtn-group">
          {status && <span className="qb-status-text">{status}</span>}
          <button className="qb-tbtn" onClick={reset}><Icon name="refresh" className="w-3.5 h-3.5" /> Reset</button>
          <button className="qb-tbtn" onClick={openRevise}>Revise</button>
          <button className="qb-tbtn qb-tbtn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div className="qb-container">
        {/* document header */}
        <div className="qb-doc-header">
          <div className="qb-header-top">
            <div className="qb-header-left">
              <img className="qb-header-mark" src={CELESTILE_MARK_RED} alt="" />
              <img className="qb-header-logo" src={CELESTILE_LOGO} alt="Celestile" />
              <div>
                <div className="qb-brand-name">CELESTILE</div>
                <div className="qb-brand-tagline">The Home &amp; Bath Boutique</div>
              </div>
            </div>
            <div className="qb-doc-type-block">
              <div className="qb-doc-type">QUOTATION</div>
              <div className="qb-ref-badge">REF: {header.refNo || '—'}</div>
            </div>
          </div>
          <div className="qb-gold-rule" />
        </div>

        {/* info grid */}
        <div className="qb-info-section">
          <div className="qb-info-grid">
            {FIELD_ORDER.map((f) => (
              <div className="qb-info-field" key={f.key}>
                <label>{f.label}</label>
                {f.textarea
                  ? <textarea rows={1} value={header[f.key]} placeholder={f.placeholder}
                      onChange={(e) => setH(f.key, e.target.value)} />
                  : <input type={f.type || 'text'} list={f.list} readOnly={f.readOnly}
                      value={f.key === 'quoteDate' ? header.quoteDate : header[f.key]}
                      placeholder={f.placeholder}
                      onBlur={f.useOnBlur ? onConsultantBlur : undefined}
                      onChange={f.key === 'quoteDate'
                        ? (e) => setHeader((h) => ({ ...h, quoteDate: e.target.value, validity: validityFrom(e.target.value) }))
                        : (e) => setH(f.key, e.target.value)} />}
              </div>
            ))}
          </div>
        </div>

        <div className="qb-body-content">
          <div className="qb-section-header">
            <div className="qb-section-num">01</div>
            <div className="qb-section-label">Selections</div>
            <div className="qb-section-rule" />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="qb-items-table">
              <colgroup>
                <col style={{ width: 26 }} /><col style={{ width: 50 }} /><col style={{ width: 140 }} /><col style={{ width: 54 }} />
                <col style={{ width: 70 }} /><col style={{ width: 98 }} /><col style={{ width: 68 }} /><col style={{ width: 68 }} />
                <col style={{ width: 56 }} /><col style={{ width: 72 }} /><col style={{ width: 46 }} /><col style={{ width: 52 }} />
                <col style={{ width: 78 }} /><col style={{ width: 26 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th><th>Image</th><th>Description</th><th>Area</th><th>Size</th><th>Material</th>
                  <th>Thickness</th><th>Unit</th><th>Rate Type</th><th>Rate (₹)</th><th>Qty</th><th>GST %</th>
                  <th style={{ textAlign: 'right' }}>Amount</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const eff = calc.rowData[i] || { gross: 0, qty: 0, hasInput: false };
                  const needsImage = !r.img && (r.desc || r.area || Number(r.price) || Number(r.qty));
                  return (
                    <tr key={i} className={i % 2 === 1 ? 'qb-row-even' : ''}>
                      <td className="qb-sno-cell">{i + 1}</td>
                      <td className="qb-img-cell">
                        {r.img ? (
                          <div className="qb-img-wrap">
                            <ZoomImg className="qb-img-preview-thumb" src={r.img} />
                            <label className="qb-img-change" title="Replace image">
                              <Icon name="edit" className="w-3.5 h-3.5" />
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImg(i, e.target.files[0], e.target)} />
                            </label>
                          </div>
                        ) : (
                          <label className="qb-img-container">
                            <div className={`qb-img-placeholder ${needsImage ? 'qb-img-required' : ''}`}>+</div>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImg(i, e.target.files[0], e.target)} />
                          </label>
                        )}
                      </td>
                      <td><input value={r.desc} placeholder="Description" onChange={(e) => setRow(i, 'desc', e.target.value)} /></td>
                      <td><input value={r.area} placeholder="—" onChange={(e) => setRow(i, 'area', e.target.value)} /></td>
                      <td><input value={r.size} placeholder="5×7" onChange={(e) => setRow(i, 'size', e.target.value)} /></td>
                      <td>
                        <select value={r.mat} onChange={(e) => {
                          if (e.target.value === ADD_ITEM_VALUE) { setAddFor(i); return; }
                          setRow(i, 'mat', e.target.value);
                        }}>
                          <option value="">—</option>
                          {r.mat && !matOptions.includes(r.mat) && <option value={r.mat}>{r.mat}</option>}
                          {matOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                          <option value={ADD_ITEM_VALUE}>＋ Add new item…</option>
                        </select>
                      </td>
                      <td><input list="bq-thk" value={r.thk} placeholder="18MM" onChange={(e) => setRow(i, 'thk', e.target.value)} /></td>
                      <td className="qb-unit-wrap"><input list="bq-unit" value={r.unit} placeholder="—" onChange={(e) => setRow(i, 'unit', e.target.value)} /></td>
                      <td className="qb-rate-type-cell">
                        <label className="qb-rate-type-toggle" title="Rate per SFT (qty = size W×H)">
                          <input type="checkbox" checked={r.module} onChange={(e) => setRow(i, 'module', e.target.checked)} />
                          <span>SFT</span>
                        </label>
                      </td>
                      <td><CalcInput className="qb-num-input" value={r.price} onChange={(v) => setRow(i, 'price', v)} title="Type a formula, e.g. 2850*45" /></td>
                      <td>
                        {r.module
                          ? <input className="qb-num-input qb-readonly-qty" readOnly value={eff.qty ? +Number(eff.qty).toFixed(2) : ''} />
                          : <CalcInput className="qb-num-input" value={r.qty} onChange={(v) => setRow(i, 'qty', v)} title="Type a formula, e.g. 2850*45" />}
                      </td>
                      <td><CalcInput className="qb-num-input" value={r.gst} onChange={(v) => setRow(i, 'gst', v)} /></td>
                      <td className="qb-amt-cell">{eff.hasInput ? inr0(eff.gross) : ''}</td>
                      <td><button className="qb-del-btn" onClick={() => delRow(i)}><Icon name="x" className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="qb-add-row-btn" onClick={addRow}>+ Add Item</button>

          <div className="qb-bottom-grid">
            <div className="qb-bank-panel">
              <div className="qb-bank-title">Bank Details</div>
              <div className="qb-bank-row"><span className="qb-bank-key">Name</span><span className="qb-bank-val">Vijayaananth Realtech</span></div>
              <div className="qb-bank-row"><span className="qb-bank-key">Account No.</span><span className="qb-bank-val">50200093326161</span></div>
              <div className="qb-bank-row"><span className="qb-bank-key">Bank</span><span className="qb-bank-val">HDFC Bank</span></div>
              <div className="qb-bank-row"><span className="qb-bank-key">IFSC Code</span><span className="qb-bank-val">HDFC0001755</span></div>
              <div className="qb-payment-terms-title">Payment Terms</div>
              <div className="qb-pt-row"><span className="qb-pt-pct">60%</span><span className="qb-pt-desc">Advance to process the order</span></div>
              <div className="qb-pt-row"><span className="qb-pt-pct">35%</span><span className="qb-pt-desc">Balance payment before delivery</span></div>
              <div className="qb-pt-row"><span className="qb-pt-pct">5%</span><span className="qb-pt-desc">Payment after finishing and before sealer</span></div>
            </div>

            <div className="qb-totals-panel">
              <div className="qb-totals-add-bar"><button className="qb-add-total-btn" onClick={addCustom}>+ Add Row</button></div>
              {totals.map((t) => {
                if (t.id === 'basicSaleValue') return <div key={t.id} className="qb-total-row"><span className="qb-label">Basic Sale Value</span><span className="qb-value">{inr0(calc.basicSale)}</span></div>;
                if (t.id === 'subTotal') return <div key={t.id} className="qb-total-row qb-subtotal-row"><span className="qb-label">Sub Total</span><span className="qb-value">{inr0(calc.subTotal)}</span></div>;
                if (t.id === 'gst') return <div key={t.id} className="qb-total-row"><span className="qb-label">GST (as applicable)</span><span className="qb-value">{inr0(calc.totalGst)}</span></div>;
                if (t.type === 'manual-discount') return (
                  <div key={t.id} className={`qb-total-row qb-discount-row ${!parseFloat(t.value) ? 'qb-zero-discount' : ''}`}>
                    <span className="qb-label">Discount</span>
                    <div className="qb-total-input-wrap">
                      <CalcInput className="qb-total-input" style={{ width: 40 }} value={t.value} onChange={(v) => setTotal(t.id, { value: v })} />
                      <span>%</span>
                      <span style={{ marginLeft: 8, whiteSpace: 'nowrap' }}>− {inr0(calc.discount)}</span>
                    </div>
                  </div>
                );
                if (t.type === 'rate-area') return (
                  <div key={t.id} className="qb-total-row">
                    <span className="qb-label">{t.label} <small style={{ color: 'var(--qb-gold-dark)' }}>(₹{t.rate}/unit)</small></span>
                    <div className="qb-rate-area-wrap">
                      <CalcInput className="qb-area-input" placeholder="Area" value={t.area} onChange={(v) => setTotal(t.id, { area: v })} />
                      <span className="qb-ra-eq">=</span>
                      <span className="qb-computed-val">{inr0((t.rate || 0) * (parseFloat(t.area) || 0))}</span>
                    </div>
                  </div>
                );
                const isCustom = t.id.startsWith('custom_');
                return (
                  <div key={t.id} className="qb-total-row">
                    {isCustom
                      ? <input className="qb-row-label-input" value={t.label} onChange={(e) => setTotal(t.id, { label: e.target.value })} />
                      : <span className="qb-label">{t.label}</span>}
                    <div className="qb-total-input-wrap">
                      <span>₹</span>
                      <CalcInput className="qb-total-input" value={t.value} onChange={(v) => setTotal(t.id, { value: v })} />
                      {isCustom && <button className="qb-del-btn" onClick={() => removeTotal(t.id)}><Icon name="x" className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                );
              })}
              <div className="qb-total-row qb-grand">
                <span className="qb-label">Grand Total</span>
                <span className="qb-value">{inr0(calc.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* stone characteristics */}
        <div className="qb-stone-chars-section">
          <div className="qb-section-header" style={{ marginTop: 0 }}>
            <div className="qb-section-label" style={{ fontSize: '0.85rem' }}>Natural Stone Characteristics</div>
            <div className="qb-section-rule" />
          </div>
          <div className="qb-stone-chars-grid">
            <div className="qb-stone-char-item"><div className="qb-stone-char-title">Natural Variation</div><div className="qb-stone-char-body">As these are natural stones, variations in colour, grain pattern, porosity, and thickness of approximately 15–20% are inherent and to be expected. These natural characteristics make each piece unique.</div></div>
            <div className="qb-stone-char-item"><div className="qb-stone-char-title">Cleaning Instructions</div><div className="qb-stone-char-body">Please avoid using acidic or alkaline substances to clean the stone surfaces, as they may react with the stone and cause permanent patches or discoloration.</div></div>
            <div className="qb-stone-char-item"><div className="qb-stone-char-title">Natural Features</div><div className="qb-stone-char-body">Due to the natural structure of the stone, grains and pores may open up during production, transit, or installation. Our experienced craftsmen will address and finish these areas.</div></div>
            <div className="qb-stone-char-item"><div className="qb-stone-char-title">Chemical Treatment Disclaimer</div><div className="qb-stone-char-body">The high-grade surface treatments and chemicals used are synthetic and may age differently over time. This may cause the stone's appearance to evolve naturally with use.</div></div>
          </div>
        </div>

        {/* terms */}
        <div className="qb-terms-section">
          <div className="qb-terms-title">Terms &amp; Conditions</div>
          <ul className="qb-terms-columns">
            {TERMS.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>

        {/* signatures */}
        <div className="qb-sig-section">
          <div className="qb-sig-block"><div className="qb-sig-line" /><div className="qb-sig-label">Agreed by Client / Signature</div></div>
          <div className="qb-sig-block"><div className="qb-sig-line" /><div className="qb-sig-label">For Celestile / Authorized Signatory</div></div>
        </div>

        <div className="qb-doc-footer">
          <p>Celestile · The Home &amp; Bath Boutique<span className="qb-sep">|</span>www.celestile.com</p>
          <p>BANGALORE: SARJAPUR MAIN ROAD<span className="qb-sep">|</span>+91 9008882854</p>
        </div>
      </div>

      {/* revise modal */}
      {showRevise && (
        <div className="qb-modal" onClick={() => setShowRevise(false)}>
          <div className="qb-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Load Quotation</h3>
            <select value={selRef} onChange={(e) => setSelRef(e.target.value)}>
              {reviseList.length === 0 && <option value="">No saved quotations</option>}
              {reviseList.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="qb-tbtn qb-tbtn-primary" style={{ flex: 1 }} disabled={!selRef} onClick={loadSelected}>Load</button>
              <button className="qb-tbtn" onClick={() => setShowRevise(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .qb-scope {
          --qb-gold:#b08d57; --qb-gold-light:#d4b483; --qb-gold-dark:#8a6d3b;
          --qb-cream:#faf7f2; --qb-cream-dark:#e8dece; --qb-border:#d9cfc0;
          --qb-green:#243020; --qb-text:#2a2218; --qb-muted:#7a6e60; --qb-beige:#ede5d3;
          font-family:'Jost',sans-serif;
        }
        .qb-toolbar{background:var(--qb-green);border-radius:10px;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;}
        .qb-toolbar-title{color:var(--qb-gold-light);font-family:'Cormorant Garamond',serif;font-size:1.05rem;font-weight:600;letter-spacing:1px;}
        .qb-toolbar-ref{color:rgba(212,180,131,0.65);font-size:0.72rem;letter-spacing:1px;margin-top:2px;font-family:Arial,sans-serif;}
        .qb-tbtn-group{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
        .qb-status-text{color:var(--qb-gold-light);font-size:0.75rem;margin-right:6px;}
        .qb-tbtn{padding:7px 16px;border-radius:2px;border:1px solid rgba(176,141,87,0.4);background:transparent;color:#c9b48a;cursor:pointer;font-family:'Jost',sans-serif;font-size:0.72rem;letter-spacing:1.2px;text-transform:uppercase;transition:all 0.2s;}
        .qb-tbtn:hover{background:rgba(176,141,87,0.15);border-color:var(--qb-gold);}
        .qb-tbtn:disabled{opacity:0.4;cursor:not-allowed;}
        .qb-tbtn-primary{background:linear-gradient(135deg,#b08d57,#8a6d3b);color:#fff1da;border:none;font-weight:600;}
        .qb-tbtn-primary:hover{background:linear-gradient(135deg,#c4a06b,#9a7d4b);}

        .qb-container{background:#fff;box-shadow:0 8px 40px rgba(100,80,40,0.14),0 0 0 1px rgba(176,141,87,0.18);}

        .qb-doc-header{background:var(--qb-green);padding:24px 36px 22px;position:relative;overflow:hidden;border-bottom:3px solid var(--qb-gold);}
        .qb-doc-header::before{content:'';position:absolute;top:-60px;right:-60px;width:240px;height:240px;border:1px solid rgba(176,141,87,0.10);border-radius:50%;pointer-events:none;}
        .qb-header-top{display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1;flex-wrap:wrap;gap:12px;}
        .qb-header-left{display:flex;align-items:center;gap:18px;}
        .qb-header-logo{width:74px;height:74px;border-radius:50%;background:#000;box-shadow:0 0 0 1px rgba(176,141,87,0.5),0 4px 14px rgba(0,0,0,0.3);object-fit:cover;flex-shrink:0;}
        .qb-header-mark{width:48px;height:48px;background:#fff;border-radius:6px;padding:4px;box-shadow:0 0 0 1px rgba(176,141,87,0.5),0 4px 14px rgba(0,0,0,0.3);object-fit:contain;flex-shrink:0;}
        .qb-brand-name{font-family:'Cormorant Garamond',serif;font-size:2.2rem;font-weight:400;color:var(--qb-gold-light);letter-spacing:7px;line-height:1;}
        .qb-brand-tagline{font-size:0.6rem;letter-spacing:4.5px;text-transform:uppercase;color:var(--qb-gold);margin-top:6px;}
        .qb-doc-type-block{text-align:right;}
        .qb-doc-type{font-family:'Cormorant Garamond',serif;font-size:1.5rem;font-weight:500;color:var(--qb-gold-light);letter-spacing:5px;}
        .qb-ref-badge{background:rgba(176,141,87,0.10);border:1px solid rgba(176,141,87,0.45);padding:5px 14px;font-size:0.7rem;letter-spacing:2px;color:var(--qb-gold-light);margin-top:8px;display:inline-block;font-family:Arial,sans-serif;}
        .qb-gold-rule{height:1px;background:linear-gradient(90deg,transparent,rgba(176,141,87,0.75),transparent);margin:18px 0 0;}

        .qb-info-section{padding:20px 36px;background:var(--qb-cream);border-bottom:1px solid var(--qb-border);}
        .qb-info-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 20px;}
        .qb-info-field label{display:block;font-size:0.68rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--qb-muted);margin-bottom:5px;}
        .qb-info-field input,.qb-info-field textarea{width:100%;border:1px solid var(--qb-border);border-radius:5px;background:rgba(176,141,87,0.045);outline:none;padding:7px 9px;font-family:'Jost',sans-serif;font-size:0.9rem;color:var(--qb-text);font-weight:500;resize:none;transition:background .15s,box-shadow .15s;}
        .qb-info-field input:focus,.qb-info-field textarea:focus{background:#fff;box-shadow:0 0 0 1px var(--qb-gold);}
        .qb-info-field input::placeholder,.qb-info-field textarea::placeholder{color:#a89e90;font-weight:300;}
        .qb-info-field input[readonly]{background:rgba(176,141,87,0.09);color:var(--qb-muted);}

        .qb-body-content{padding:24px 36px;}
        .qb-section-header{display:flex;align-items:center;gap:12px;margin:20px 0 10px;}
        .qb-section-header:first-child{margin-top:0;}
        .qb-section-num{width:24px;height:24px;border-radius:50%;background:var(--qb-green);color:var(--qb-gold-light);font-size:0.7rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:Arial,sans-serif;}
        .qb-section-label{font-family:'Cormorant Garamond',serif;font-size:1rem;font-weight:600;letter-spacing:2px;color:var(--qb-green);text-transform:uppercase;}
        .qb-section-rule{flex:1;height:1px;background:var(--qb-border);}

        .qb-items-table{width:100%;border-collapse:collapse;font-size:0.85rem;table-layout:fixed;}
        .qb-items-table thead tr{background:var(--qb-green);}
        .qb-items-table th{padding:9px 4px;color:rgba(232,218,196,0.9);font-weight:500;letter-spacing:1px;font-size:0.64rem;text-transform:uppercase;text-align:left;}
        .qb-items-table tbody tr{border-bottom:1px solid var(--qb-cream-dark);}
        .qb-items-table tbody tr.qb-row-even{background:var(--qb-cream);}
        .qb-items-table td{padding:6px 3px;vertical-align:middle;}
        .qb-items-table td input{width:100%;border:1px solid transparent;border-radius:4px;background:rgba(176,141,87,0.045);outline:none;padding:4px 5px;font-family:'Jost',sans-serif;font-size:0.83rem;color:var(--qb-text);transition:background .15s,box-shadow .15s;}
        .qb-items-table td input:focus{background:#fff;box-shadow:0 0 0 1px var(--qb-gold);}
        .qb-num-input{text-align:right;font-family:Arial,sans-serif !important;font-size:0.85rem !important;}
        .qb-readonly-qty{background:rgba(176,141,87,0.1) !important;color:var(--qb-muted) !important;}
        .qb-sno-cell{width:26px;text-align:center;font-weight:700;font-size:0.8rem;color:var(--qb-muted);font-family:Arial,sans-serif;}
        .qb-amt-cell{text-align:right;font-weight:600;color:var(--qb-text);white-space:nowrap;font-family:Arial,sans-serif;font-size:0.85rem;}
        .qb-del-btn{background:none;border:none;cursor:pointer;color:#ccc;font-size:0.75rem;padding:2px 6px;}
        .qb-del-btn:hover{color:#c0392b;}
        .qb-add-row-btn{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:5px 14px;border:1px dashed rgba(176,141,87,0.4);background:transparent;color:var(--qb-gold-dark);font-family:'Jost',sans-serif;font-size:0.7rem;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;}
        .qb-add-row-btn:hover{background:rgba(176,141,87,0.08);border-color:var(--qb-gold);}

        .qb-master-warn{margin:0 0 10px;padding:6px 10px;border:1px solid #f0d090;background:#fdf6e3;color:#8a6100;font-family:Arial,sans-serif;font-size:0.72rem;}
        @media print { .qb-master-warn{display:none;} }

        .qb-img-cell{width:50px;}
        .qb-img-container{width:40px;height:40px;display:block;cursor:pointer;}
        .qb-img-placeholder{width:40px;height:40px;border:1px dashed rgba(176,141,87,0.35);background:rgba(176,141,87,0.04);display:flex;align-items:center;justify-content:center;color:rgba(176,141,87,0.5);font-size:1.1rem;}
        .qb-img-placeholder.qb-img-required{border:1px dashed #c0392b;background:rgba(192,57,43,0.06);color:#c0392b;}
        .qb-img-preview-thumb{width:40px;height:40px;object-fit:cover;border:1px solid var(--qb-border);cursor:zoom-in;}
        /* Thumb is click-to-enlarge, so replacing the image moved to this badge. */
        .qb-img-wrap{position:relative;width:40px;height:40px;}
        .qb-img-change{position:absolute;right:-5px;bottom:-5px;width:15px;height:15px;border-radius:50%;background:#fff;border:1px solid var(--qb-border);color:var(--qb-gold,#b08d57);font-size:8px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.18);}
        .qb-img-change:hover{background:rgba(176,141,87,0.08);}

        .qb-rate-type-cell{text-align:center;}
        .qb-rate-type-toggle{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;font-size:0.56rem;color:var(--qb-muted);letter-spacing:1px;text-transform:uppercase;font-weight:600;}
        .qb-rate-type-toggle input{margin:0;width:14px;height:14px;cursor:pointer;accent-color:var(--qb-green);}

        .qb-bottom-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:20px;margin-top:24px;}
        .qb-bank-panel{background:var(--qb-cream);border:1px solid var(--qb-border);padding:16px 18px;}
        .qb-bank-title{font-family:'Cormorant Garamond',serif;font-size:0.85rem;font-weight:600;letter-spacing:2px;color:var(--qb-green);text-transform:uppercase;margin-bottom:12px;border-bottom:1px solid var(--qb-border);padding-bottom:8px;}
        .qb-bank-row{display:flex;gap:10px;padding:5px 0;border-bottom:1px solid rgba(217,207,192,0.5);font-size:0.82rem;}
        .qb-bank-key{width:90px;flex-shrink:0;color:var(--qb-muted);font-weight:500;}
        .qb-bank-val{color:var(--qb-text);font-weight:600;font-family:Arial,sans-serif;}
        .qb-payment-terms-title{font-family:'Cormorant Garamond',serif;font-size:0.82rem;font-weight:600;letter-spacing:2px;color:var(--qb-green);text-transform:uppercase;margin-top:14px;margin-bottom:8px;border-bottom:1px solid var(--qb-border);padding-bottom:6px;}
        .qb-pt-row{display:flex;gap:10px;padding:5px 0;border-bottom:1px solid rgba(217,207,192,0.4);font-size:0.8rem;align-items:baseline;}
        .qb-pt-row:last-child{border-bottom:none;}
        .qb-pt-pct{flex-shrink:0;width:42px;color:var(--qb-gold-dark);font-weight:700;font-family:Arial,sans-serif;font-size:0.82rem;}
        .qb-pt-desc{color:var(--qb-muted);line-height:1.4;}

        .qb-totals-panel{border:1px solid var(--qb-border);overflow:hidden;height:fit-content;}
        .qb-total-row{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--qb-cream-dark);font-size:0.86rem;gap:8px;}
        .qb-label{color:var(--qb-muted);}
        .qb-value{font-weight:600;color:var(--qb-text);white-space:nowrap;font-family:Arial,sans-serif;font-size:0.9rem;}
        .qb-subtotal-row{background:rgba(176,141,87,0.06);}
        .qb-discount-row .qb-label,.qb-discount-row span{color:#9a3a1f;}
        .qb-discount-row.qb-zero-discount{opacity:0.55;}
        .qb-total-row.qb-grand{background:var(--qb-beige);padding:12px 14px;border-bottom:none;border-top:2px solid rgba(176,141,87,0.4);}
        .qb-total-row.qb-grand .qb-label{color:#5a4a30;font-size:0.76rem;letter-spacing:1px;text-transform:uppercase;}
        .qb-total-row.qb-grand .qb-value{color:var(--qb-green);font-size:1.15rem;font-family:Arial,sans-serif;font-weight:700;}
        .qb-total-input{border:1px solid var(--qb-border);border-radius:4px;background:rgba(176,141,87,0.05);outline:none;padding:3px 6px;font-family:Arial,sans-serif;font-size:0.88rem;font-weight:600;color:var(--qb-text);width:74px;text-align:right;transition:background .15s,box-shadow .15s;}
        .qb-total-input:focus{background:#fff;box-shadow:0 0 0 1px var(--qb-gold);}
        .qb-total-input-wrap{display:flex;align-items:center;gap:4px;}
        .qb-row-label-input{border:1px solid transparent;border-radius:4px;background:rgba(176,141,87,0.04);outline:none;padding:3px 6px;font-family:'Jost',sans-serif;font-size:0.84rem;color:var(--qb-muted);width:100%;}
        .qb-row-label-input:focus{background:#fff;box-shadow:0 0 0 1px var(--qb-gold);}
        .qb-totals-add-bar{padding:7px 14px;border-bottom:1px solid var(--qb-cream-dark);background:rgba(176,141,87,0.02);}
        .qb-add-total-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border:1px dashed rgba(176,141,87,0.4);background:transparent;color:var(--qb-gold-dark);font-family:'Jost',sans-serif;font-size:0.7rem;letter-spacing:1px;text-transform:uppercase;cursor:pointer;}
        .qb-add-total-btn:hover{background:rgba(176,141,87,0.1);}

        .qb-rate-area-wrap{display:flex;align-items:center;gap:6px;justify-content:flex-end;}
        .qb-area-input{width:56px;border:1px solid var(--qb-border);border-radius:4px;padding:3px 6px;background:rgba(176,141,87,0.06);font-family:Arial,sans-serif;font-size:0.82rem;color:var(--qb-text);text-align:right;}
        .qb-area-input:focus{background:#fff;box-shadow:0 0 0 1px var(--qb-gold);outline:none;}
        .qb-ra-eq{color:var(--qb-muted);font-size:0.76rem;}
        .qb-computed-val{font-weight:600;color:var(--qb-text);font-family:Arial,sans-serif;font-size:0.9rem;white-space:nowrap;min-width:74px;text-align:right;}

        .qb-stone-chars-section{padding:28px 36px 20px;}
        .qb-stone-chars-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 32px;margin-top:14px;}
        .qb-stone-char-item{padding:14px 16px;background:var(--qb-cream);border-left:3px solid var(--qb-gold);}
        .qb-stone-char-title{font-size:0.74rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--qb-green);margin-bottom:5px;}
        .qb-stone-char-body{font-size:0.8rem;color:var(--qb-muted);line-height:1.6;}

        .qb-terms-section{padding:24px 36px;background:var(--qb-cream);border-top:1px solid var(--qb-border);}
        .qb-terms-title{font-family:'Cormorant Garamond',serif;font-size:0.9rem;font-weight:600;letter-spacing:2px;color:var(--qb-green);text-transform:uppercase;margin-bottom:14px;}
        .qb-terms-columns{columns:3;gap:28px;list-style:none;margin:0;padding:0;}
        .qb-terms-columns li{font-size:0.76rem;color:var(--qb-muted);line-height:1.55;margin-bottom:6px;padding-left:12px;position:relative;break-inside:avoid;}
        .qb-terms-columns li::before{content:'—';position:absolute;left:0;color:var(--qb-gold-light);}

        .qb-sig-section{padding:20px 36px;display:flex;gap:40px;}
        .qb-sig-block{flex:1;}
        .qb-sig-line{height:44px;border-bottom:1px solid var(--qb-border);margin-bottom:6px;}
        .qb-sig-label{font-size:0.65rem;letter-spacing:2px;text-transform:uppercase;color:var(--qb-muted);}

        .qb-doc-footer{background:var(--qb-green);padding:14px 36px;text-align:center;border-top:3px solid var(--qb-gold);}
        .qb-doc-footer p{font-size:0.63rem;letter-spacing:1.5px;color:var(--qb-gold);text-transform:uppercase;line-height:1.8;margin:0;}
        .qb-doc-footer p:last-child{color:var(--qb-gold-dark);}
        .qb-sep{margin:0 10px;color:rgba(176,141,87,0.4);}

        .qb-modal{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:50;backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:40px 16px;}
        .qb-modal-box{background:#fff;width:340px;max-width:92%;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,0.25);}
        .qb-modal-box h3{font-family:'Cormorant Garamond',serif;font-size:1.2rem;color:var(--qb-green);letter-spacing:1.5px;margin-bottom:14px;}
        .qb-modal-box select{width:100%;padding:9px;margin-top:6px;border:1px solid var(--qb-border);background:var(--qb-cream);font-family:'Jost',sans-serif;font-size:0.8rem;outline:none;}

        @media (max-width: 860px) {
          .qb-info-grid{grid-template-columns:repeat(2,1fr);}
          .qb-bottom-grid{grid-template-columns:1fr;}
          .qb-terms-columns{columns:1;}
          .qb-stone-chars-grid{grid-template-columns:1fr;}
        }

        @media print {
          .qb-toolbar{display:none;}
          .qb-stone-chars-section{page-break-before:always;break-before:page;}
        }
      `}</style>
    </div>
  );
}

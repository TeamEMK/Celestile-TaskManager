'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ZoomImg } from '@/app/components/ImageLightbox';
import Icon from '../components/Icon';
import DateField from '../components/DateField';
import OrderNumberInput from '../components/OrderNumberInput';
import { isValidOrderNumber, ORDER_HINT } from '@/lib/orderNumber';

/* ── Bangalore Site Engineer constants ───────────────────────────────── */
const BLR_PURPOSE_OPTIONS = [
  'Measurement',
  'Handover',
  'Explanation of electrical work',
  'Explanation of wood work',
  'Checks',
];

/* ── Hyderabad Site Engineer constants ───────────────────────────────── */
const HYD_PURPOSE_OPTIONS = [
  'Measurement',
  'Handover',
  'Explanation of electrical work',
  'Explanation of wood work',
  'Checks',
  'Pre-Installation Check',
];

const CHECKS_OPTIONS = [
  'Re-measurement',
  'Wall condition',
  'Wood work',
  'Electrical work',
  'Finishing',
  'Installation',
  'Sealer',
];

/* ── Designer constants ──────────────────────────────────────────────── */
const TASK_TYPES = ['2D drawing', '3D drawing', 'render', 'jointing details', 'measurement file', 'program'];
const SOFTWARES  = ['2D drawing', '3D drawing', 'render', 'jointing details', 'measurement file', 'program'];

/* ── Bangalore Sales constants ───────────────────────────────────────── */
const BLR_SALES_TASK_TYPES = [
  'Physical Presentation',
  'Virtual Presentation',
  'Quotation Making',
  'Quotation Modification',
  'Follow up call',
  'Cold calling',
];

/* ── Hyderabad Sales constants ───────────────────────────────────────── */
const HYD_SALES_TASK_TYPES = [
  'Physical Presentation',
  'Virtual Presentation',
  'Quotation Making',
  'Quotation Modification',
  'Follow up call',
  'Cold calling',
  'Drawing Request',
  'Material order Request',
];

/* ── Executive Assistant constants ───────────────────────────────────── */
const OLD_NEW_OPTIONS = ['Old Client', 'New Client'];
const PAY_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

// The two forms the Executive Assistant fills — also offered to admins.
const EA_FORM_OPTIONS = [
  { label: 'Daily Walk-in Report',    value: 'Walk-in'       },
  { label: 'Sales Report (Payments)', value: 'Sales Payment' },
];

/* ── Admin form options ──────────────────────────────────────────────── */
const FORM_OPTIONS = [
  { label: 'Designer',      value: 'Designer'      },
  { label: 'Site Engineer', value: 'Site Engineer' },
  { label: 'Sales',         value: 'Sales'         },
  ...EA_FORM_OPTIONS,
];

/* ── Blank rows ──────────────────────────────────────────────────────── */
const blankSiteRow = () => ({
  client: '', orderNumber: '', siteLocation: '', areaName: '',
  purposeOfVisit: '', checksType: '', kmsTravelled: '', minutes: '',
  preInstallImage: '', preInstallComment: '',
});
const blankDesignerRow = () => ({
  client: '', orderNumber: '', areaName: '',
  taskType: '', software: '', revision: false, minutes: '',
});
const blankSalesRow = () => ({
  client: '', clientNumber: '', taskType: '', description: '',
  areaName: '', siteLocation: '', minutes: '',
});
const blankWalkinRow = () => ({
  client: '', clientNumber: '', arcName: '', arcPhone: '',
  oldNewClient: '', noOfVisits: '', description: '', remarks: '', executive: '',
});
const blankPaymentRow = () => ({
  client: '', arcName: '', description: '',
  orderValue: '', advPaid: '', balance: '', modeOfPay: '',
  tillDateReceived: '', balanceTarget: '', executive: '',
});

const todayISO = () => new Date().toISOString().split('T')[0];
const fmt = (iso) => new Date(iso).toLocaleDateString('en-GB').replaceAll('/', '-');

// Maps a user's stored department value (old shorthand OR new full name) to
// the correct daily-task form type: 'Sales' | 'Site Engineer' | 'Designer'.
function deptToFormType(dept) {
  const d = (dept || '').toLowerCase().trim();
  const SALES  = ['sales', 'sales person', 'crm', 'client relationship manager'];
  const SITE   = ['sc', 'runner', 'process coordinator', 'pc', 'site engineer'];
  if (SALES.includes(d))  return 'Sales';
  if (SITE.includes(d))   return 'Site Engineer';
  if (isEaDept(dept))     return 'Walk-in';
  return 'Designer';
}

// The Executive Assistant fills TWO forms (Walk-in + Payments), so unlike
// every other department they get a form switcher instead of one fixed form.
function isEaDept(dept) {
  const d = (dept || '').toLowerCase().trim();
  return d === 'ea' || d === 'executive assistant';
}

export default function DailyTaskClient() {
  const { data: session } = useSession();
  const doerId     = session?.user?.id         || '';
  const doer       = session?.user?.name       || '';
  const department = session?.user?.department || '';

  const isAdmin = !!(session?.user?.roles?.includes('Admin') || session?.user?.roles?.includes('HOD'));

  // Branch from user's profile (normalized to title-case: 'Bangalore' or 'Hyderabad').
  // Empty string means no branch locked — user/admin can switch freely.
  const rawBranch    = session?.user?.branch || '';
  const profileBranch = rawBranch ? rawBranch.charAt(0).toUpperCase() + rawBranch.slice(1) : '';

  const [selectedForm, setSelectedForm] = useState('');
  const [branch, setBranch]             = useState('Bangalore');

  // Sync branch from profile once session loads
  useEffect(() => {
    if (profileBranch) setBranch(profileBranch);
  }, [profileBranch]);
  const [entryDate, setEntryDate]       = useState(todayISO());
  const [rows, setRows]                 = useState([blankDesignerRow()]);
  const [saving, setSaving]             = useState(false);
  const [msg, setMsg]                   = useState('');
  const [past, setPast]                 = useState([]);
  const [clients, setClients]           = useState([]);

  // Computed only after mount so the server-rendered HTML and the first
  // client render match exactly — otherwise this "now" timestamp differs
  // between server and browser and triggers React hydration error #418,
  // which crashes the app and breaks client-side navigation.
  const [nowLabel, setNowLabel] = useState('');
  useEffect(() => {
    setNowLabel(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }));
  }, []);

  const isEaUser       = !isAdmin && isEaDept(department);
  const activeDept     = isAdmin ? selectedForm
                       : isEaUser ? (selectedForm || 'Walk-in')
                       : deptToFormType(department);
  const isSiteEngineer = activeDept === 'Site Engineer';
  const isSales        = activeDept === 'Sales';
  const isWalkin       = activeDept === 'Walk-in';
  const isPayments     = activeDept === 'Sales Payment';
  const isEaForm       = isWalkin || isPayments;
  const isHyderabad    = branch === 'Hyderabad';
  const blankRow       = isSiteEngineer ? blankSiteRow
                       : isSales        ? blankSalesRow
                       : isWalkin       ? blankWalkinRow
                       : isPayments     ? blankPaymentRow
                       : blankDesignerRow;

  const purposeOptions = isHyderabad ? HYD_PURPOSE_OPTIONS : BLR_PURPOSE_OPTIONS;
  const salesTaskTypes = isHyderabad ? HYD_SALES_TASK_TYPES : BLR_SALES_TASK_TYPES;

  function handleFormSwitch(val) {
    setSelectedForm(val);
    if (val === 'Site Engineer')       setRows([blankSiteRow()]);
    else if (val === 'Sales')          setRows([blankSalesRow()]);
    else if (val === 'Walk-in')        setRows([blankWalkinRow()]);
    else if (val === 'Sales Payment')  setRows([blankPaymentRow()]);
    else                               setRows([blankDesignerRow()]);
    setMsg('');
  }

  function handleBranchSwitch(val) {
    setBranch(val);
    if (isSiteEngineer) setRows([blankSiteRow()]);
    else if (isSales)   setRows([blankSalesRow()]);
    setMsg('');
  }

  function handlePreInstallImage(e, i) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxW = 800, maxH = 800;
      let w = img.width, h = img.height;
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      setRow(i, 'preInstallImage', canvas.toDataURL('image/jpeg', 0.65));
      URL.revokeObjectURL(url);
    };
    img.src = url;
    e.target.value = '';
  }

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.ok ? r.json() : [])
      .then(data => setClients(Array.isArray(data) ? data.map(c => c.name) : []))
      .catch(() => {});
  }, []);

  const total = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0),
    [rows]
  );

  async function loadPast() {
    if (!doerId) return;
    try {
      const res  = await fetch(`/api/daily-tasks?doerId=${doerId}`);
      const data = await res.json();
      setPast(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }
  useEffect(() => { loadPast(); }, [doerId]);

  const setRow = (i, key, val) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  // Payments rows: Bal follows Order Value − Adv Paid, but stays editable.
  const setPayRow = (i, key, val) =>
    setRows((rs) => rs.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, [key]: val };
      if (key === 'orderValue' || key === 'advPaid') {
        next.balance = (next.orderValue === '' && next.advPaid === '') ? ''
          : String((Number(next.orderValue) || 0) - (Number(next.advPaid) || 0));
      }
      return next;
    }));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const dupRow = (i) => setRows((rs) => [...rs.slice(0, i + 1), { ...rs[i] }, ...rs.slice(i + 1)]);
  const delRow = (i) => setRows((rs) => rs.length === 1 ? [blankRow()] : rs.filter((_, idx) => idx !== i));

  async function submitAll() {
    const hasData = isSiteEngineer
      ? (r) => r.client || r.orderNumber || r.siteLocation || r.areaName || r.purposeOfVisit || Number(r.minutes) > 0
      : isSales
      ? (r) => r.client || r.clientNumber || r.taskType || r.description || r.areaName || Number(r.minutes) > 0
      : isWalkin
      ? (r) => r.client || r.clientNumber || r.arcName || r.description || r.remarks || r.executive
      : isPayments
      ? (r) => r.client || r.arcName || r.description || Number(r.orderValue) > 0 || Number(r.advPaid) > 0
      : (r) => r.client || r.orderNumber || r.areaName || r.taskType || r.software || Number(r.minutes) > 0;

    const clean = rows.filter(hasData).map((r) => ({
      ...r,
      department: activeDept,
      branch,
      ...(!isSiteEngineer && !isSales && !isEaForm && { revision: r.revision ? 'Yes' : 'No' }),
    }));

    if (clean.length === 0) { setMsg('Add at least one row.'); return; }

    // An order number is what every report groups this row under, so a typo
    // here doesn't show up as a typo — it shows up as a second order.
    const badOrder = clean.find((r) => r.orderNumber && !isValidOrderNumber(r.orderNumber));
    if (badOrder) { setMsg(`Order number "${badOrder.orderNumber}" is not valid. ${ORDER_HINT}`); return; }

    if (isSiteEngineer) {
      const inc = clean.find((r) => !r.client || !r.orderNumber || !r.siteLocation || !r.areaName || !r.purposeOfVisit || !r.minutes);
      if (inc) { setMsg('All fields in every row are required.'); return; }
      const checksInc = clean.find((r) => r.purposeOfVisit === 'Checks' && !r.checksType);
      if (checksInc) { setMsg('Please select a Checks type for all "Checks" rows.'); return; }
    } else if (isSales) {
      const inc = clean.find((r) => !r.client || !r.taskType || !r.minutes);
      if (inc) { setMsg('Client Name, Type of Task, and Duration are required.'); return; }
    } else if (isWalkin) {
      const inc = clean.find((r) => !r.client || !r.clientNumber || !r.oldNewClient);
      if (inc) { setMsg('Client Name, Phone No. and Old/New Client are required.'); return; }
    } else if (isPayments) {
      const inc = clean.find((r) => !r.client || (!Number(r.orderValue) && !Number(r.advPaid)));
      if (inc) { setMsg('Client Name and Order Value (or Adv Paid) are required.'); return; }
    } else {
      const inc = clean.find((r) => !r.client || !r.orderNumber || !r.areaName || !r.taskType || !r.software || !r.minutes);
      if (inc) { setMsg('All fields in every row are required (Revision is optional).'); return; }
    }

    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/daily-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryDate, doerId, doer, rows: clean }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setMsg('Submitted!');
      setRows([blankRow()]);
      loadPast();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  const grouped = useMemo(() => {
    const g = {};
    for (const e of past) {
      const k = (e.entryDate || '').split('T')[0];
      (g[k] ||= []).push(e);
    }
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [past]);

  const formReady = !isAdmin || !!selectedForm;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card p-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconClipboard /></div>
            <div>
              <div className="text-[15px] font-semibold text-slate-900">Daily Report</div>
              <div className="text-[12px] text-slate-500 flex items-center gap-2 flex-wrap">
                Welcome <b>{doer || 'User'}</b>
                {department && <span className="pill bg-slate-100 text-slate-500">{department}</span>}
                {profileBranch && (
                  <span className={`pill font-semibold ${profileBranch === 'Hyderabad' ? 'bg-violet-50 text-violet-700' : 'bg-primary-50 text-primary-700'}`}>
                    {profileBranch}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-[12px] text-slate-500">{nowLabel}</div>
        </div>

        {/* Admin: Branch first → then Department */}
        {isAdmin && (
          <div className="mb-5">
            {/* Step 1: Branch — hidden when profile branch is locked */}
            {!profileBranch && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Step 1 — Branch</div>
                <div className="seg mb-4">
                  {[
                    { id: 'Bangalore', label: 'Bangalore' },
                    { id: 'Hyderabad', label: 'Hyderabad' },
                    { id: 'Factory',   label: 'Factory'   },
                  ].map((b) => (
                    <button key={b.id}
                      onClick={() => { setBranch(b.id); setSelectedForm(''); setRows([blankDesignerRow()]); setMsg(''); }}
                      className={`seg-btn ${branch === b.id ? 'seg-btn-active' : ''}`}
                    >{b.label}</button>
                  ))}
                </div>
              </>
            )}

            {/* Step 2 (or Step 1 if branch locked): Department */}
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">{profileBranch ? 'Step 1' : 'Step 2'} — Department</div>
            <div className="seg flex-wrap">
              {FORM_OPTIONS.map((f) => (
                <button key={f.value}
                  onClick={() => handleFormSwitch(f.value)}
                  className={`seg-btn ${selectedForm === f.value ? 'seg-btn-active' : ''}`}
                >{f.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Executive Assistant: picks which of their two reports to fill */}
        {isEaUser && (
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Report</div>
            <div className="seg max-w-md">
              {EA_FORM_OPTIONS.map((f) => (
                <button key={f.value}
                  onClick={() => handleFormSwitch(f.value)}
                  className={`seg-btn flex-1 ${activeDept === f.value ? 'seg-btn-active' : ''}`}
                >{f.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Non-admin: branch selector for SE/Sales — hidden when profile branch is locked */}
        {!isAdmin && !profileBranch && (isSiteEngineer || isSales) && (
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Branch</div>
            <div className="seg max-w-xs">
              {['Bangalore', 'Hyderabad', 'Factory'].map((b) => (
                <button key={b}
                  onClick={() => handleBranchSwitch(b)}
                  className={`seg-btn flex-1 ${branch === b ? 'seg-btn-active' : ''}`}
                >{b}</button>
              ))}
            </div>
          </div>
        )}

        {formReady && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 max-w-md">
              <div>
                <label className="label">Entry Date</label>
                <DateField className="input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Doer</label>
                <input className="input bg-slate-50" value={doer} disabled />
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[520px] rounded-lg border border-slate-200">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                  <tr>
                    {isWalkin ? (
                      <>
                        <th className="table-th">Client Name</th>
                        <th className="table-th">Phone No.</th>
                        <th className="table-th">Arc. Name</th>
                        <th className="table-th">Arc. Phone No.</th>
                        <th className="table-th">Old/New Client</th>
                        <th className="table-th">No. of Visits</th>
                        <th className="table-th">Requirement</th>
                        <th className="table-th">Remarks</th>
                        <th className="table-th">Executive</th>
                      </>
                    ) : isPayments ? (
                      <>
                        <th className="table-th">Client Name</th>
                        <th className="table-th">Arc. Name</th>
                        <th className="table-th">Requirement</th>
                        <th className="table-th">Order Value</th>
                        <th className="table-th">Adv Paid</th>
                        <th className="table-th">Bal</th>
                        <th className="table-th">Mode of Pay</th>
                        <th className="table-th">Till Date Received Total</th>
                        <th className="table-th">Balance Target</th>
                        <th className="table-th">Executive</th>
                      </>
                    ) : (
                      <>
                        <th className="table-th">Client Name</th>
                        {isSales ? (
                          <th className="table-th">Client Number</th>
                        ) : (
                          <th className="table-th">Order Number</th>
                        )}
                        {/* Site Location: always for Site Engineer; for Sales only Hyderabad */}
                        {(isSiteEngineer || (isSales && isHyderabad)) && (
                          <th className="table-th">Site Location</th>
                        )}
                        <th className="table-th">{isSiteEngineer ? 'Area (Space)' : 'Area Name'}</th>
                        {isSiteEngineer && <th className="table-th">Purpose of Visit</th>}
                        {!isSiteEngineer && <th className="table-th">Type of Task</th>}
                        {!isSiteEngineer && !isSales && (
                          <>
                            <th className="table-th">Software</th>
                            <th className="table-th text-center">Revision</th>
                          </>
                        )}
                        {isSales && <th className="table-th">Purpose of Task</th>}
                        {isSiteEngineer && <th className="table-th">KMS Travelled</th>}
                        <th className="table-th">Duration (min)</th>
                      </>
                    )}
                    <th className="table-th text-right pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="table-row align-top">
                      {isWalkin ? (
                        <>
                          <td className="table-td min-w-[140px]">
                            <input className="input" list="dt-clients" placeholder="Client name"
                              value={r.client} onChange={(e) => setRow(i, 'client', e.target.value)} />
                          </td>
                          <td className="table-td w-32">
                            <input type="number" className="input" placeholder="Phone no."
                              value={r.clientNumber} onChange={(e) => setRow(i, 'clientNumber', e.target.value)} />
                          </td>
                          <td className="table-td min-w-[120px]">
                            <input className="input" placeholder="Architect name"
                              value={r.arcName} onChange={(e) => setRow(i, 'arcName', e.target.value)} />
                          </td>
                          <td className="table-td w-32">
                            <input type="number" className="input" placeholder="Arc. phone"
                              value={r.arcPhone} onChange={(e) => setRow(i, 'arcPhone', e.target.value)} />
                          </td>
                          <td className="table-td min-w-[110px]">
                            <select className="input" value={r.oldNewClient}
                              onChange={(e) => setRow(i, 'oldNewClient', e.target.value)}>
                              <option value="">--select--</option>
                              {OLD_NEW_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                          <td className="table-td w-24">
                            <input type="number" min="1" className="input" placeholder="Visits"
                              value={r.noOfVisits} onChange={(e) => setRow(i, 'noOfVisits', e.target.value)} />
                          </td>
                          <td className="table-td min-w-[140px]">
                            <input className="input" placeholder="Requirement"
                              value={r.description} onChange={(e) => setRow(i, 'description', e.target.value)} />
                          </td>
                          <td className="table-td min-w-[140px]">
                            <input className="input" placeholder="Remarks"
                              value={r.remarks} onChange={(e) => setRow(i, 'remarks', e.target.value)} />
                          </td>
                          <td className="table-td min-w-[120px]">
                            <input className="input" placeholder="Executive"
                              value={r.executive} onChange={(e) => setRow(i, 'executive', e.target.value)} />
                          </td>
                        </>
                      ) : isPayments ? (
                        <>
                          <td className="table-td min-w-[140px]">
                            <input className="input" list="dt-clients" placeholder="Client name"
                              value={r.client} onChange={(e) => setRow(i, 'client', e.target.value)} />
                          </td>
                          <td className="table-td min-w-[120px]">
                            <input className="input" placeholder="Architect name"
                              value={r.arcName} onChange={(e) => setRow(i, 'arcName', e.target.value)} />
                          </td>
                          <td className="table-td min-w-[140px]">
                            <input className="input" placeholder="Requirements"
                              value={r.description} onChange={(e) => setRow(i, 'description', e.target.value)} />
                          </td>
                          <td className="table-td w-28">
                            <input type="number" min="0" className="input" placeholder="₹"
                              value={r.orderValue} onChange={(e) => setPayRow(i, 'orderValue', e.target.value)} />
                          </td>
                          <td className="table-td w-28">
                            <input type="number" min="0" className="input" placeholder="₹"
                              value={r.advPaid} onChange={(e) => setPayRow(i, 'advPaid', e.target.value)} />
                          </td>
                          <td className="table-td w-28">
                            <input type="number" className="input" placeholder="₹"
                              value={r.balance} onChange={(e) => setRow(i, 'balance', e.target.value)} />
                          </td>
                          <td className="table-td min-w-[110px]">
                            <select className="input" value={r.modeOfPay}
                              onChange={(e) => setRow(i, 'modeOfPay', e.target.value)}>
                              <option value="">--select--</option>
                              {PAY_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </td>
                          <td className="table-td w-28">
                            <input type="number" min="0" className="input" placeholder="₹"
                              value={r.tillDateReceived} onChange={(e) => setRow(i, 'tillDateReceived', e.target.value)} />
                          </td>
                          <td className="table-td w-28">
                            <input type="number" min="0" className="input" placeholder="₹"
                              value={r.balanceTarget} onChange={(e) => setRow(i, 'balanceTarget', e.target.value)} />
                          </td>
                          <td className="table-td min-w-[120px]">
                            <input className="input" placeholder="Executive"
                              value={r.executive} onChange={(e) => setRow(i, 'executive', e.target.value)} />
                          </td>
                        </>
                      ) : (
                      <>
                      {/* Client Name */}
                      <td className="table-td">
                        <input className="input" list="dt-clients" placeholder="--select--"
                          value={r.client} onChange={(e) => setRow(i, 'client', e.target.value)} />
                      </td>

                      {/* Client Number (Sales) / Order Number (SE + Designer) */}
                      {isSales ? (
                        <td className="table-td w-32">
                          <input type="number" className="input" placeholder="Phone no."
                            value={r.clientNumber} onChange={(e) => setRow(i, 'clientNumber', e.target.value)} />
                        </td>
                      ) : (
                        <td className="table-td">
                          <OrderNumberInput value={r.orderNumber}
                            onChange={(e) => setRow(i, 'orderNumber', e.target.value)} />
                        </td>
                      )}

                      {/* Site Location — SE always; Sales only Hyderabad */}
                      {(isSiteEngineer || (isSales && isHyderabad)) && (
                        <td className="table-td">
                          <input className="input" placeholder="Site location"
                            value={r.siteLocation || ''} onChange={(e) => setRow(i, 'siteLocation', e.target.value)} />
                        </td>
                      )}

                      {/* Area Name */}
                      <td className="table-td">
                        <input className="input" value={r.areaName}
                          onChange={(e) => setRow(i, 'areaName', e.target.value)} />
                      </td>

                      {/* Purpose of Visit (Site Engineer) */}
                      {isSiteEngineer ? (
                        <td className="table-td min-w-[180px]">
                          <select className="input" value={r.purposeOfVisit}
                            onChange={(e) => {
                              const val = e.target.value;
                              setRow(i, 'purposeOfVisit', val);
                              if (val !== 'Checks') setRow(i, 'checksType', '');
                              if (val !== 'Pre-Installation Check') {
                                setRow(i, 'preInstallImage', '');
                                setRow(i, 'preInstallComment', '');
                              }
                            }}>
                            <option value="">--select--</option>
                            {purposeOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>

                          {/* Checks sub-dropdown */}
                          {r.purposeOfVisit === 'Checks' && (
                            <select className="input mt-1" value={r.checksType}
                              onChange={(e) => setRow(i, 'checksType', e.target.value)}>
                              <option value="">--select type--</option>
                              {CHECKS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )}

                          {/* Pre-Installation Check — Hyderabad only */}
                          {r.purposeOfVisit === 'Pre-Installation Check' && isHyderabad && (
                            <div className="mt-1 space-y-1.5">
                              <input type="file" accept="image/*"
                                className="input !py-0.5 !text-[11px] cursor-pointer"
                                onChange={(e) => handlePreInstallImage(e, i)} />
                              {r.preInstallImage && (
                                <div className="relative w-24 h-24">
                                  <ZoomImg src={r.preInstallImage} alt="Pre-install"
                                    className="w-24 h-24 object-cover rounded border border-slate-200" />
                                  <button
                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center"
                                    onClick={() => setRow(i, 'preInstallImage', '')}
                                  ><Icon name="x" className="w-3.5 h-3.5" /></button>
                                </div>
                              )}
                              <textarea className="input !text-[12px]" rows="2"
                                placeholder="Comment / notes..."
                                value={r.preInstallComment || ''}
                                onChange={(e) => setRow(i, 'preInstallComment', e.target.value)} />
                            </div>
                          )}
                        </td>
                      ) : (
                        /* Type of Task (Designer / Sales) */
                        <td className="table-td">
                          <select className="input" value={r.taskType}
                            onChange={(e) => setRow(i, 'taskType', e.target.value)}>
                            <option value="">--select--</option>
                            {(isSales ? salesTaskTypes : TASK_TYPES).map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                      )}

                      {/* Software + Revision (Designer only) */}
                      {!isSiteEngineer && !isSales && (
                        <>
                          <td className="table-td">
                            <select className="input" value={r.software}
                              onChange={(e) => setRow(i, 'software', e.target.value)}>
                              <option value="">--select--</option>
                              {SOFTWARES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="table-td text-center">
                            <input type="checkbox" className="h-4 w-4 cursor-pointer accent-primary-600"
                              checked={!!r.revision} onChange={(e) => setRow(i, 'revision', e.target.checked)} />
                          </td>
                        </>
                      )}

                      {/* Purpose of Task (Sales) */}
                      {isSales && (
                        <td className="table-td">
                          <input className="input" placeholder="Purpose of task"
                            value={r.description} onChange={(e) => setRow(i, 'description', e.target.value)} />
                        </td>
                      )}

                      {/* KMS Travelled (Site Engineer) */}
                      {isSiteEngineer && (
                        <td className="table-td w-28">
                          <input type="number" min="0" step="0.1" className="input" value={r.kmsTravelled}
                            onChange={(e) => setRow(i, 'kmsTravelled', e.target.value)} />
                        </td>
                      )}

                      {/* Duration */}
                      <td className="table-td w-24">
                        <input type="number" min="0" step="0.1" className="input" value={r.minutes}
                          onChange={(e) => setRow(i, 'minutes', e.target.value)} />
                      </td>
                      </>
                      )}

                      {/* Actions */}
                      <td className="table-td">
                        <div className="flex gap-1 justify-end">
                          <button className="btn-success" onClick={() => dupRow(i)}>DUP</button>
                          <button className="btn-danger"  onClick={() => delRow(i)}>DEL</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="dt-clients">
                {clients.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            {!isEaForm && (
              <div className="flex items-center justify-between mt-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Total Duration</span>
                <span className="text-[18px] font-bold text-amber-500">{total} <span className="text-[12px] text-slate-400">min</span></span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-4 flex-wrap">
              {msg && <span className="text-[12px] mr-auto">{msg}</span>}
              <button className="btn-secondary" onClick={addRow}>+ Add Row</button>
              <button className="btn-warn" disabled={saving} onClick={submitAll}>
                {saving ? 'Submitting…' : 'Submit All →'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Past submissions */}
      <div className="card p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconArchive /></div>
          <div>
            <h2 className="text-[13.5px] font-semibold text-slate-900">My Past Submissions</h2>
            <p className="text-[11.5px] text-slate-500">{grouped.length} day{grouped.length === 1 ? '' : 's'} logged</p>
          </div>
        </div>
        {grouped.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-3">
              <IconInbox />
            </div>
            <div className="text-[13.5px] font-semibold text-slate-700">No submissions yet</div>
            <div className="text-[12px] text-slate-500 mt-0.5">Your daily reports will appear here once submitted.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([date, entries]) => {
              const dayTotal = entries.reduce((s, e) => s + (Number(e.minutes) || 0), 0);
              return (
                <div key={date} className="border border-slate-200 rounded-lg p-3 card-hover transition-all duration-200">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-slate-800"><Icon name="calendar" className="w-3.5 h-3.5" /> {fmt(date)}</span>
                    <span className="pill bg-slate-100 text-slate-600">{entries.length} task</span>
                    <span className="pill bg-amber-50 text-amber-600">{dayTotal} min total</span>
                  </div>
                  {entries.map((e) => (
                    <div key={e.id} className="flex items-start flex-wrap gap-2 text-[12.5px] py-1">
                      {e.branch && e.branch !== 'Bangalore' && (
                        <span className="pill bg-violet-50 text-violet-700 shrink-0">{e.branch}</span>
                      )}
                      {e.client       && <span className="pill bg-orange-50 text-orange-600 shrink-0">{e.client}</span>}
                      {e.clientNumber && <span className="pill bg-slate-100 text-slate-600 shrink-0"><Icon name="phone" className="w-3.5 h-3.5" /> {e.clientNumber}</span>}
                      {e.orderNumber  && <span className="pill bg-slate-100 text-slate-600 shrink-0">#{e.orderNumber}</span>}
                      {e.siteLocation && <span className="pill bg-blue-50 text-blue-600 shrink-0">{e.siteLocation}</span>}
                      {e.areaName     && <span className="text-slate-700 shrink-0">{e.areaName}</span>}
                      {e.purposeOfVisit && (
                        <span className="pill bg-primary-50 text-primary-700 shrink-0">
                          {e.purposeOfVisit}{e.checksType ? ` → ${e.checksType}` : ''}
                        </span>
                      )}
                      {e.preInstallImage && (
                        <ZoomImg src={e.preInstallImage} alt="Pre-install"
                          className="w-14 h-14 object-cover rounded border border-slate-200 shrink-0" />
                      )}
                      {e.preInstallComment && (
                        <span className="text-slate-500 italic shrink-0 text-[11.5px]">{e.preInstallComment}</span>
                      )}
                      {Number(e.kmsTravelled) > 0 && (
                        <span className="pill bg-green-50 text-green-600 shrink-0">{e.kmsTravelled} km</span>
                      )}
                      {e.taskType    && <span className="pill bg-primary-50 text-primary-700 shrink-0">{e.taskType}</span>}
                      {e.description && <span className="text-slate-500 shrink-0">{e.description}</span>}
                      {e.software    && <span className="pill bg-slate-100 text-slate-600 shrink-0">{e.software}</span>}
                      {e.revision === 'Yes' && <span className="pill bg-red-50 text-red-600 shrink-0">Revision</span>}
                      {e.arcName      && <span className="pill bg-teal-50 text-teal-700 shrink-0">Arc: {e.arcName}{e.arcPhone ? ` (${e.arcPhone})` : ''}</span>}
                      {e.oldNewClient && <span className="pill bg-slate-100 text-slate-600 shrink-0">{e.oldNewClient}</span>}
                      {Number(e.noOfVisits) > 0 && <span className="pill bg-slate-100 text-slate-600 shrink-0">{e.noOfVisits} visit{Number(e.noOfVisits) === 1 ? '' : 's'}</span>}
                      {Number(e.orderValue) > 0 && <span className="pill bg-green-50 text-green-700 shrink-0">Order ₹{Number(e.orderValue).toLocaleString('en-IN')}</span>}
                      {Number(e.advPaid) > 0 && <span className="pill bg-emerald-50 text-emerald-700 shrink-0">Adv ₹{Number(e.advPaid).toLocaleString('en-IN')}</span>}
                      {Number(e.balance) > 0 && <span className="pill bg-rose-50 text-rose-600 shrink-0">Bal ₹{Number(e.balance).toLocaleString('en-IN')}</span>}
                      {e.modeOfPay    && <span className="pill bg-slate-100 text-slate-600 shrink-0">{e.modeOfPay}</span>}
                      {Number(e.tillDateReceived) > 0 && <span className="pill bg-sky-50 text-sky-700 shrink-0">Till Date ₹{Number(e.tillDateReceived).toLocaleString('en-IN')}</span>}
                      {Number(e.balanceTarget) > 0 && <span className="pill bg-orange-50 text-orange-600 shrink-0">Target ₹{Number(e.balanceTarget).toLocaleString('en-IN')}</span>}
                      {e.executive    && <span className="pill bg-indigo-50 text-indigo-700 shrink-0">Exec: {e.executive}</span>}
                      {e.remarks      && <span className="text-slate-500 italic shrink-0 text-[11.5px]">{e.remarks}</span>}
                      {(e.department !== 'Walk-in' && e.department !== 'Sales Payment') && (
                        <span className="ml-auto pill bg-amber-50 text-amber-600 shrink-0">{e.minutes} min</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function IconClipboard() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/></svg>; }
function IconArchive()   { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>; }
function IconInbox()     { return <svg className="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>; }

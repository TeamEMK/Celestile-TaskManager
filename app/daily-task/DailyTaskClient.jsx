'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

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

/* ── Admin form options ──────────────────────────────────────────────── */
const FORM_OPTIONS = [
  { label: 'Designer',      value: 'Designer'      },
  { label: 'Site Engineer', value: 'Site Engineer' },
  { label: 'Sales',         value: 'Sales'         },
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

const todayISO = () => new Date().toISOString().split('T')[0];
const fmt = (iso) => new Date(iso).toLocaleDateString('en-GB').replaceAll('/', '-');

export default function DailyTaskClient() {
  const { data: session } = useSession();
  const doerId     = session?.user?.id         || '';
  const doer       = session?.user?.name       || '';
  const department = session?.user?.department || '';

  const isAdmin = !!(session?.user?.roles?.includes('Admin') || session?.user?.roles?.includes('HOD'));

  const [selectedForm, setSelectedForm] = useState('');
  const [branch, setBranch]             = useState('Bangalore');
  const [entryDate, setEntryDate]       = useState(todayISO());
  const [rows, setRows]                 = useState([blankDesignerRow()]);
  const [saving, setSaving]             = useState(false);
  const [msg, setMsg]                   = useState('');
  const [past, setPast]                 = useState([]);
  const [clients, setClients]           = useState([]);

  const activeDept     = isAdmin ? selectedForm : department;
  const isSiteEngineer = activeDept === 'Site Engineer';
  const isSales        = activeDept === 'Sales';
  const isHyderabad    = branch === 'Hyderabad';
  const blankRow       = isSiteEngineer ? blankSiteRow : isSales ? blankSalesRow : blankDesignerRow;

  const purposeOptions = isHyderabad ? HYD_PURPOSE_OPTIONS : BLR_PURPOSE_OPTIONS;
  const salesTaskTypes = isHyderabad ? HYD_SALES_TASK_TYPES : BLR_SALES_TASK_TYPES;

  function handleFormSwitch(val) {
    setSelectedForm(val);
    if (val === 'Site Engineer') setRows([blankSiteRow()]);
    else if (val === 'Sales')    setRows([blankSalesRow()]);
    else                         setRows([blankDesignerRow()]);
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
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const dupRow = (i) => setRows((rs) => [...rs.slice(0, i + 1), { ...rs[i] }, ...rs.slice(i + 1)]);
  const delRow = (i) => setRows((rs) => rs.length === 1 ? [blankRow()] : rs.filter((_, idx) => idx !== i));

  async function submitAll() {
    const hasData = isSiteEngineer
      ? (r) => r.client || r.orderNumber || r.siteLocation || r.areaName || r.purposeOfVisit || Number(r.minutes) > 0
      : isSales
      ? (r) => r.client || r.clientNumber || r.taskType || r.description || r.areaName || Number(r.minutes) > 0
      : (r) => r.client || r.orderNumber || r.areaName || r.taskType || r.software || Number(r.minutes) > 0;

    const clean = rows.filter(hasData).map((r) => ({
      ...r,
      department: activeDept,
      branch,
      ...(!isSiteEngineer && !isSales && { revision: r.revision ? 'Yes' : 'No' }),
    }));

    if (clean.length === 0) { setMsg('Add at least one row.'); return; }

    if (isSiteEngineer) {
      const inc = clean.find((r) => !r.client || !r.orderNumber || !r.siteLocation || !r.areaName || !r.purposeOfVisit || !r.minutes);
      if (inc) { setMsg('❌ All fields in every row are required.'); return; }
      const checksInc = clean.find((r) => r.purposeOfVisit === 'Checks' && !r.checksType);
      if (checksInc) { setMsg('❌ Please select a Checks type for all "Checks" rows.'); return; }
    } else if (isSales) {
      const inc = clean.find((r) => !r.client || !r.taskType || !r.minutes);
      if (inc) { setMsg('❌ Client Name, Type of Task, and Duration are required.'); return; }
    } else {
      const inc = clean.find((r) => !r.client || !r.orderNumber || !r.areaName || !r.taskType || !r.software || !r.minutes);
      if (inc) { setMsg('❌ All fields in every row are required (Revision is optional).'); return; }
    }

    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/daily-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryDate, doerId, doer, rows: clean }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setMsg('✅ Submitted!');
      setRows([blankRow()]);
      loadPast();
    } catch (e) {
      setMsg('❌ ' + e.message);
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
    <div className="space-y-4">
      <div className="card p-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="text-[15px] font-semibold text-slate-900">Daily Report</div>
            <div className="text-[12px] text-slate-500 flex items-center gap-2 flex-wrap">
              Welcome <b>{doer || 'User'}</b>
              {department && <span className="pill bg-slate-100 text-slate-500">{department}</span>}
            </div>
          </div>
          <div className="text-[12px] text-slate-500">{new Date().toLocaleString('en-GB')}</div>
        </div>

        {/* Admin: Branch first → then Department */}
        {isAdmin && (
          <div className="mb-5">
            {/* Step 1: Branch */}
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Step 1 — Branch</div>
            <div className="flex gap-2 mb-4">
              {[
                { id: 'Bangalore', label: 'Bangalore', color: 'bg-blue-600 border-blue-600' },
                { id: 'Hyderabad', label: 'Hyderabad', color: 'bg-violet-600 border-violet-600' },
              ].map((b) => (
                <button key={b.id}
                  onClick={() => { setBranch(b.id); setSelectedForm(''); setRows([blankDesignerRow()]); setMsg(''); }}
                  className={`px-5 py-2 rounded-lg text-[13px] font-semibold border-2 transition-all ${
                    branch === b.id
                      ? b.color + ' text-white shadow-md'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                  }`}
                >{b.label}</button>
              ))}
            </div>

            {/* Step 2: Department */}
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Step 2 — Department</div>
            <div className="flex gap-2 flex-wrap">
              {FORM_OPTIONS.map((f) => (
                <button key={f.value}
                  onClick={() => handleFormSwitch(f.value)}
                  className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-all ${
                    selectedForm === f.value
                      ? 'bg-slate-900 text-white border-slate-900 shadow'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >{f.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Non-admin: branch selector for SE/Sales */}
        {!isAdmin && (isSiteEngineer || isSales) && (
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Branch</div>
            <div className="flex gap-2 max-w-xs">
              {[
                { id: 'Bangalore', color: 'bg-blue-600 border-blue-600' },
                { id: 'Hyderabad', color: 'bg-violet-600 border-violet-600' },
              ].map((b) => (
                <button key={b.id}
                  onClick={() => handleBranchSwitch(b.id)}
                  className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold border-2 transition-all ${
                    branch === b.id
                      ? b.color + ' text-white'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >{b.id}</button>
              ))}
            </div>
          </div>
        )}

        {formReady && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 max-w-md">
              <div>
                <label className="label">Entry Date</label>
                <input type="date" className="input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Doer</label>
                <input className="input bg-slate-50" value={doer} disabled />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="table-th !text-white">Client Name</th>
                    {isSales ? (
                      <th className="table-th !text-white">Client Number</th>
                    ) : (
                      <th className="table-th !text-white">Order Number</th>
                    )}
                    {/* Site Location: always for Site Engineer; for Sales only Hyderabad */}
                    {(isSiteEngineer || (isSales && isHyderabad)) && (
                      <th className="table-th !text-white">Site Location</th>
                    )}
                    <th className="table-th !text-white">{isSiteEngineer ? 'Area (Space)' : 'Area Name'}</th>
                    {isSiteEngineer && <th className="table-th !text-white">Purpose of Visit</th>}
                    {!isSiteEngineer && <th className="table-th !text-white">Type of Task</th>}
                    {!isSiteEngineer && !isSales && (
                      <>
                        <th className="table-th !text-white">Software</th>
                        <th className="table-th !text-white text-center">Revision</th>
                      </>
                    )}
                    {isSales && <th className="table-th !text-white">Purpose of Task</th>}
                    {isSiteEngineer && <th className="table-th !text-white">KMS Travelled</th>}
                    <th className="table-th !text-white">Duration (min)</th>
                    <th className="table-th !text-white text-right pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 align-top">
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
                          <input className="input" value={r.orderNumber}
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
                                  <img src={r.preInstallImage} alt="Pre-install"
                                    className="w-24 h-24 object-cover rounded border border-slate-200" />
                                  <button
                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center"
                                    onClick={() => setRow(i, 'preInstallImage', '')}
                                  >✕</button>
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

            <div className="flex items-center justify-between mt-3 px-3 py-2 bg-slate-50 rounded-lg">
              <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Total Duration</span>
              <span className="text-[18px] font-bold text-amber-500">{total} <span className="text-[12px] text-slate-400">min</span></span>
            </div>

            <div className="flex items-center justify-end gap-2 mt-4">
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
        <div className="text-[14px] font-semibold text-slate-900 mb-3">📒 My Past Submissions</div>
        {grouped.length === 0 ? (
          <p className="text-[12.5px] text-slate-400">No submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(([date, entries]) => {
              const dayTotal = entries.reduce((s, e) => s + (Number(e.minutes) || 0), 0);
              return (
                <div key={date} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-slate-800">📅 {fmt(date)}</span>
                    <span className="pill bg-slate-100 text-slate-600">{entries.length} task</span>
                    <span className="pill bg-amber-50 text-amber-600">{dayTotal} min total</span>
                  </div>
                  {entries.map((e) => (
                    <div key={e.id} className="flex items-start flex-wrap gap-2 text-[12.5px] py-1">
                      {e.branch && e.branch !== 'Bangalore' && (
                        <span className="pill bg-violet-50 text-violet-700 shrink-0">{e.branch}</span>
                      )}
                      {e.client       && <span className="pill bg-orange-50 text-orange-600 shrink-0">{e.client}</span>}
                      {e.clientNumber && <span className="pill bg-slate-100 text-slate-600 shrink-0">📞 {e.clientNumber}</span>}
                      {e.orderNumber  && <span className="pill bg-slate-100 text-slate-600 shrink-0">#{e.orderNumber}</span>}
                      {e.siteLocation && <span className="pill bg-blue-50 text-blue-600 shrink-0">{e.siteLocation}</span>}
                      {e.areaName     && <span className="text-slate-700 shrink-0">{e.areaName}</span>}
                      {e.purposeOfVisit && (
                        <span className="pill bg-primary-50 text-primary-700 shrink-0">
                          {e.purposeOfVisit}{e.checksType ? ` → ${e.checksType}` : ''}
                        </span>
                      )}
                      {e.preInstallImage && (
                        <img src={e.preInstallImage} alt="Pre-install"
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
                      <span className="ml-auto pill bg-amber-50 text-amber-600 shrink-0">{e.minutes} min</span>
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

'use client';
import { useEffect, useMemo, useState } from 'react';

/* ── helpers ──────────────────────────────────────────────────────── */
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const fmtDt    = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' + new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

function cityBadge(orderNo) {
  if (!orderNo) return null;
  if (orderNo.toUpperCase().startsWith('B')) return { label: 'BLR', cls: 'bg-primary-100 text-primary-700' };
  if (orderNo.toUpperCase().startsWith('H')) return { label: 'HYD', cls: 'bg-violet-100 text-violet-700' };
  return null;
}

function getStepStatus(entry, stepIdx, totalSteps) {
  const data = entry.steps?.[stepIdx];
  if (data?.completed_at) return 'done';
  // find first uncompleted step
  let cur = totalSteps;
  for (let i = 0; i < totalSteps; i++) {
    if (!entry.steps?.[i]?.completed_at) { cur = i; break; }
  }
  if (stepIdx > cur)  return 'future';
  if (stepIdx < cur)  return 'done';   // safety (shouldn't happen)
  // stepIdx === cur → current pending step
  const lead = entry.lead_date;
  if (lead && lead < todayStr()) return 'overdue';
  return 'pending';
}

const FLOW_COLORS = ['#2563eb','#7c3aed','#0891b2','#059669','#d97706','#dc2626','#0d9488','#9333ea','#db2777'];

/* ── main component ───────────────────────────────────────────────── */
export default function FMSClient() {
  const [flows,          setFlows]         = useState([]);
  const [view,           setView]          = useState('hub');
  const [activeFlow,     setActiveFlow]    = useState(null);
  const [entries,        setEntries]       = useState([]);
  const [loadingFlows,   setLoadingFlows]  = useState(true);
  const [loadingEntries, setLoadingEntries]= useState(false);
  const [modal,          setModal]         = useState(null);
  const [users,          setUsers]         = useState([]);
  const [confirm,        setConfirm]       = useState(null); // { msg, onOk }
  const [stepForm,       setStepForm]      = useState(null); // { entry, stepIdx, stepName }
  const [stepDoneBy,     setStepDoneBy]    = useState('');

  const askConfirm = (msg, onOk) => setConfirm({ msg, onOk });

  // filters
  const [search,      setSearch]      = useState('');
  const [filterDoer,  setFilterDoer]  = useState('All');
  const [filterTech,  setFilterTech]  = useState('All');
  const [filterStep,  setFilterStep]  = useState('All');
  const [filterCity,  setFilterCity]  = useState('All');

  // form state
  const [flowForm, setFlowForm] = useState({ name:'', coordinator:'', steps:[''], color:'#2563eb', tab:'manual' });
  const [entryForm, setEntryForm] = useState({ skm_no:'', order_no:'', client_name:'', area:'', technology:'', sft:'', lead_date:'', planned_date:'', doer_name:'' });
  const [saving, setSaving] = useState(false);

  // import state
  const [importUrl,     setImportUrl]     = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const [importBusy,    setImportBusy]    = useState(false);
  const [importErr,     setImportErr]     = useState('');

  /* ── data loaders ─────────────────────────────────────────────── */
  async function loadFlows() {
    setLoadingFlows(true);
    const d = await fetch('/api/fms/types').then(r => r.json()).catch(() => ({}));
    setFlows(d.flows || []);
    setLoadingFlows(false);
  }

  async function loadEntries(flowId) {
    setLoadingEntries(true);
    const d = await fetch(`/api/fms/entries?flowId=${flowId}`).then(r => r.json()).catch(() => ({}));
    setEntries(d.entries || []);
    setLoadingEntries(false);
  }

  useEffect(() => {
    loadFlows();
    fetch('/api/users').then(r => r.json()).then(rows => {
      setUsers(Array.isArray(rows) ? rows.filter(u => u.active !== 0) : []);
    }).catch(() => {});
  }, []);

  /* ── navigation ───────────────────────────────────────────────── */
  function openFlow(flow) {
    setActiveFlow(flow);
    setView('sheet');
    setSearch(''); setFilterDoer('All'); setFilterTech('All'); setFilterStep('All'); setFilterCity('All');
    loadEntries(flow.id);
  }

  function backToHub() {
    setView('hub');
    setActiveFlow(null);
    setEntries([]);
    loadFlows();
  }

  /* ── step interaction ─────────────────────────────────────────── */
  async function markStep(entryId, stepIdx, undo, completedBy) {
    await fetch('/api/fms/entries/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId, stepIndex: stepIdx, undo, completedBy: completedBy || '' }),
    });
    loadEntries(activeFlow.id);
  }

  function openStepForm(entry, stepIdx, stepName) {
    setStepDoneBy(entry.doer_name || '');
    setStepForm({ entry, stepIdx, stepName });
  }

  async function submitStepDone() {
    if (!stepForm) return;
    await markStep(stepForm.entry.id, stepForm.stepIdx, false, stepDoneBy);
    setStepForm(null);
  }

  /* ── save new flow ────────────────────────────────────────────── */
  async function saveFlow() {
    if (!flowForm.name.trim()) return;
    setSaving(true);
    const steps = flowForm.steps.filter(s => s.trim());
    await fetch('/api/fms/types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: flowForm.name, coordinator: flowForm.coordinator, steps, color: flowForm.color }),
    });
    setSaving(false);
    setModal(null);
    setFlowForm({ name:'', coordinator:'', steps:[''], color:'#2563eb', tab:'manual' });
    loadFlows();
  }

  /* ── delete flow ──────────────────────────────────────────────── */
  function deleteFlow(flow) {
    askConfirm(
      `"${flow.name}" aur uski saari ${flow.stats?.total || 0} entries delete ho jaayengi. Confirm karo?`,
      async () => {
        await fetch(`/api/fms/types?id=${flow.id}`, { method: 'DELETE' });
        loadFlows();
      }
    );
  }

  /* ── save new entry ───────────────────────────────────────────── */
  async function saveEntry() {
    if (!entryForm.client_name.trim() && !entryForm.skm_no.trim()) return;
    setSaving(true);
    await fetch('/api/fms/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entryForm, flow_id: activeFlow.id }),
    });
    setSaving(false);
    setModal(null);
    setEntryForm({ skm_no:'', order_no:'', client_name:'', area:'', technology:'', sft:'', lead_date:'', planned_date:'', doer_name:'' });
    loadEntries(activeFlow.id);
  }

  /* ── import ───────────────────────────────────────────────────── */
  async function previewImport() {
    if (!importUrl.trim()) return;
    setImportBusy(true); setImportErr(''); setImportPreview(null);
    const d = await fetch('/api/fms/import-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl: importUrl }),
    }).then(r => r.json()).catch(e => ({ error: e.message }));
    setImportBusy(false);
    if (d.error) setImportErr(d.error);
    else setImportPreview(d);
  }

  async function confirmImport() {
    setImportBusy(true); setImportErr('');
    const d = await fetch('/api/fms/import-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sheetUrl: importUrl,
        confirm: true,
        flowId: modal === 'importNew' ? null : activeFlow?.id,
        flowName: flowForm.name || importPreview?.detectedSteps?.[0] || 'Imported FMS',
        flowCoordinator: flowForm.coordinator || importPreview?.detectedDoers?.[0] || '',
        steps: importPreview?.detectedSteps || [],
      }),
    }).then(r => r.json()).catch(e => ({ error: e.message }));
    setImportBusy(false);
    if (d.error) { setImportErr(d.error); return; }
    alert(`✓ Imported ${d.imported} entries (${d.skipped} skipped)`);
    setModal(null); setImportUrl(''); setImportPreview(null);
    if (d.flowId && !activeFlow) {
      loadFlows();
    } else if (activeFlow) {
      loadEntries(activeFlow.id);
    }
  }

  /* ── derived data ─────────────────────────────────────────────── */
  const flowSteps  = activeFlow?.steps || [];
  const allDoers   = useMemo(() => Array.from(new Set(entries.map(e => e.doer_name).filter(Boolean))).sort(), [entries]);
  const allTechs   = useMemo(() => Array.from(new Set(entries.map(e => e.technology).filter(Boolean))).sort(), [entries]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return entries.filter(e => {
      if (s && !(
        (e.skm_no||'').toLowerCase().includes(s) ||
        (e.client_name||'').toLowerCase().includes(s) ||
        (e.order_no||'').toLowerCase().includes(s) ||
        (e.area||'').toLowerCase().includes(s)
      )) return false;
      if (filterDoer !== 'All' && e.doer_name !== filterDoer) return false;
      if (filterTech !== 'All' && e.technology !== filterTech) return false;
      if (filterCity !== 'All') {
        const c = cityBadge(e.order_no);
        if (!c || c.label !== filterCity) return false;
      }
      if (filterStep !== 'All') {
        const idx = parseInt(filterStep);
        let cur = flowSteps.length;
        for (let i = 0; i < flowSteps.length; i++) {
          if (!e.steps?.[i]?.completed_at) { cur = i; break; }
        }
        if (cur !== idx) return false;
      }
      return true;
    });
  }, [entries, search, filterDoer, filterTech, filterCity, filterStep, flowSteps]);

  /* ────────────────────────────────────────────────────────────────
     HUB VIEW
  ──────────────────────────────────────────────────────────────── */
  if (view === 'hub') return (
    <div className="flex flex-col gap-4 animate-fade-in" style={{ minHeight: 'calc(100vh - 96px)' }}>
      {/* Header */}
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconLayers /></div>
          <div>
            <div className="section-title">Flow Management System</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{flows.length} flows · Click a row to open</div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary !text-[12px]" onClick={() => setModal('importNew')}>↑ Import from Sheet</button>
          <button className="btn-primary !text-[12px]"  onClick={() => setModal('addFlow')}>+ Add New FMS</button>
        </div>
      </div>

      {/* Flow list table */}
      <div className="card overflow-hidden flex-1">
        {loadingFlows ? (
          <div className="p-10 text-center text-slate-400 text-[13px]">Loading…</div>
        ) : flows.length === 0 ? (
          <div className="p-14 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3 text-2xl">🗂</div>
            <div className="text-[13.5px] font-semibold text-slate-700">No FMS flows yet</div>
            <div className="text-[12px] text-slate-500 mt-0.5">Click "Add New FMS" or "Import from Sheet" to get started</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['FMS Name','Process Coordinator','Total Steps','Total Tasks','Pending','Overview'].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
                <th className="table-th w-8" />
              </tr>
            </thead>
            <tbody>
              {flows.map(flow => {
                const done = flow.stats.total - flow.stats.pending;
                const pct  = flow.stats.total > 0 ? Math.round((done / flow.stats.total) * 100) : 0;
                return (
                  <tr key={flow.id} className="table-row cursor-pointer" onClick={() => openFlow(flow)}>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: flow.color }} />
                        <span className="font-semibold text-[12px] text-slate-900">{flow.name}</span>
                      </div>
                    </td>
                    <td className="table-td text-slate-600">{flow.coordinator || '—'}</td>
                    <td className="table-td text-center font-semibold text-slate-700">{flow.steps.length}</td>
                    <td className="table-td text-center font-semibold text-slate-700">{flow.stats.total}</td>
                    <td className="table-td text-center">
                      {flow.stats.pending > 0
                        ? <span className="pill bg-amber-50 text-amber-700">{flow.stats.pending}</span>
                        : <span className="pill bg-emerald-50 text-emerald-700">0</span>}
                    </td>
                    <td className="table-td w-36">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width:`${pct}%`, background: flow.color }} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 tabular-nums w-7 text-right">{pct}%</span>
                      </div>
                    </td>
                    <td className="table-td" onClick={e => e.stopPropagation()}>
                      <button className="text-slate-300 hover:text-red-500 transition text-[14px]" title="Delete" onClick={() => deleteFlow(flow)}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {confirm && <ConfirmModal msg={confirm.msg} onOk={() => { confirm.onOk(); setConfirm(null); }} onCancel={() => setConfirm(null)} />}
      {/* Modals for hub */}
      {modal === 'addFlow' && (
        <Modal title="New FMS Flow" icon={<IconPlus />} onClose={() => setModal(null)}>
          <AddFlowBody form={flowForm} setForm={setFlowForm} users={users} />
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn-primary" disabled={saving || !flowForm.name.trim()} onClick={saveFlow}>
              {saving ? 'Creating…' : 'Create FMS'}
            </button>
          </div>
        </Modal>
      )}
      {modal === 'importNew' && (
        <Modal title="Import FMS from Google Sheet" icon={<IconUpload />} onClose={() => { setModal(null); setImportUrl(''); setImportPreview(null); setImportErr(''); }}>
          <ImportBody
            url={importUrl} setUrl={setImportUrl}
            preview={importPreview} busy={importBusy} err={importErr}
            onPreview={previewImport}
            flowForm={flowForm} setFlowForm={setFlowForm}
            showFlowFields
          />
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => { setModal(null); setImportUrl(''); setImportPreview(null); setImportErr(''); }}>Cancel</button>
            {importPreview && !importBusy && (
              <button className="btn-primary" onClick={confirmImport}>Create & Import</button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );

  /* ────────────────────────────────────────────────────────────────
     SHEET VIEW
  ──────────────────────────────────────────────────────────────── */
  const tableWidth = 660 + flowSteps.length * 46;

  return (
    <div className="space-y-3 animate-fade-in">

      {/* Top bar */}
      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <button className="btn-ghost !text-[12px]" onClick={backToHub}>← Back</button>
        <div className="w-px h-5 bg-slate-200 hidden sm:block" />
        <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{ background: `${activeFlow.color}1A`, color: activeFlow.color }}>
          <IconLayers />
        </div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-slate-900 font-display truncate">{activeFlow.name}</div>
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
            {activeFlow.coordinator && <span>{activeFlow.coordinator}</span>}
            {activeFlow.coordinator && <span className="text-slate-300">•</span>}
            <span>{entries.length} entries</span>
          </div>
        </div>
        <div className="flex-1" />
        <button className="btn-secondary !text-[12px]" onClick={() => { setModal('importSheet'); setImportUrl(''); setImportPreview(null); setImportErr(''); }}>
          ↑ Import Sheet
        </button>
        <button className="btn-primary !text-[12px]" onClick={() => setModal('addEntry')}>+ Add Entry</button>
      </div>

      {/* Filter bar */}
      <div className="card p-2.5 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client, SKM, order…" className="input !text-[12px] pl-8 !w-52 !py-1.5" />
        </div>
        <Select value={filterDoer} onChange={setFilterDoer} options={['All Doers', ...allDoers]} allLabel="All Doers" />
        <Select value={filterTech} onChange={setFilterTech} options={['All Tech', ...allTechs]} allLabel="All Tech" />
        <Select value={filterCity} onChange={setFilterCity} options={['All Cities','BLR','HYD']} allLabel="All Cities" />
        <Select value={filterStep} onChange={setFilterStep}
          options={['All Steps', ...flowSteps.map((s,i) => `Step ${i+1}`)]}
          allLabel="All Steps"
          valueMap={['All', ...flowSteps.map((_,i) => String(i))]}
        />
        {/* Legend */}
        <div className="hidden sm:flex items-center gap-3 text-[10.5px] text-slate-500 ml-1">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />Done</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block" />Overdue</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-200 inline-block" />Pending</span>
        </div>
        <div className="ml-auto text-[11px] text-slate-400 tabular-nums">{filtered.length}/{entries.length}</div>
      </div>

      {/* Step header labels */}
      {flowSteps.length > 0 && (
        <div className="card p-2.5 flex flex-wrap gap-1.5">
          {flowSteps.map((step, i) => (
            <span key={i} className="pill bg-primary-50 text-primary-700 text-[10px]">
              <span className="font-bold">S{i+1}</span> — {step.length > 45 ? step.slice(0,45)+'…' : step}
            </span>
          ))}
        </div>
      )}

      {/* Sheet table */}
      <div className="card overflow-hidden">
        {loadingEntries ? (
          <div className="p-10 text-center text-slate-400 text-[13px]">Loading entries…</div>
        ) : filtered.length === 0 ? (
          <div className="p-14 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
              <svg className="w-6 h-6 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <div className="text-[13.5px] font-semibold text-slate-700">No entries found</div>
            <div className="text-[12px] text-slate-500 mt-0.5">Try adjusting your filters or search</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ minWidth: tableWidth + 'px' }}>
              <thead>
                <tr>
                  <th className="table-th sticky left-0 z-20 bg-slate-50/95 border-r border-slate-200 min-w-[110px]">SKM No</th>
                  <th className="table-th sticky left-[110px] z-20 bg-slate-50/95 border-r border-slate-200 min-w-[150px]">Client</th>
                  <th className="table-th min-w-[80px]">Order</th>
                  <th className="table-th min-w-[120px]">Area</th>
                  <th className="table-th min-w-[80px]">Tech</th>
                  <th className="table-th min-w-[45px] text-right">SFT</th>
                  <th className="table-th min-w-[80px]">Lead Date</th>
                  <th className="table-th min-w-[80px]">Doer</th>
                  {flowSteps.map((step, i) => (
                    <th key={i} className="table-th min-w-[44px] text-center" title={step}>
                      <span className="text-[9px] font-bold">S{i+1}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, idx) => {
                  const city = cityBadge(entry.order_no);
                  const isOverdueRow = entry.lead_date && entry.lead_date < todayStr() &&
                    Object.values(entry.steps || {}).some(s => !s?.completed_at);
                  return (
                    <tr key={entry.id} className={`table-row ${idx % 2 === 1 ? 'bg-slate-50/40' : ''} ${isOverdueRow ? 'bg-red-50/20' : ''}`}>
                      <td className="table-td sticky left-0 z-10 bg-inherit border-r border-slate-100">
                        <div className="flex items-center gap-1.5">
                          {city && <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${city.cls}`}>{city.label}</span>}
                          <span className="font-semibold text-[11.5px] text-slate-800">{entry.skm_no || '—'}</span>
                        </div>
                      </td>
                      <td className="table-td sticky left-[110px] z-10 bg-inherit border-r border-slate-100 max-w-[148px]">
                        <span className="truncate block font-medium text-slate-800" title={entry.client_name}>{entry.client_name || '—'}</span>
                      </td>
                      <td className="table-td text-slate-500 text-[11px]">{entry.order_no || '—'}</td>
                      <td className="table-td max-w-[120px] truncate text-slate-600 text-[11px]" title={entry.area}>{entry.area || '—'}</td>
                      <td className="table-td">
                        {entry.technology
                          ? <span className="pill bg-slate-100 text-slate-600 text-[9.5px]">{entry.technology}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="table-td text-right tabular-nums text-slate-600">{entry.sft || '—'}</td>
                      <td className="table-td whitespace-nowrap">
                        {entry.lead_date
                          ? <span className={`text-[11px] ${entry.lead_date < todayStr() ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>{fmtDate(entry.lead_date)}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="table-td text-[11px] text-slate-600">{entry.doer_name || '—'}</td>
                      {flowSteps.map((stepName, si) => {
                        const status   = getStepStatus(entry, si, flowSteps.length);
                        const stepData = entry.steps?.[si];
                        return (
                          <td key={si} className="table-td p-0.5 text-center">
                            <StepCell
                              status={status}
                              completedAt={stepData?.completed_at}
                              completedBy={stepData?.completed_by}
                              stepName={`Step ${si+1}: ${stepName}`}
                              onClick={() => {
                                if (status === 'done') {
                                  askConfirm(
                                    `Step ${si+1} ko "${entry.client_name || entry.skm_no}" ke liye unmark karo?`,
                                    () => markStep(entry.id, si, true)
                                  );
                                } else if (status !== 'future') {
                                  openStepForm(entry, si, flowSteps[si]);
                                }
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirm && <ConfirmModal msg={confirm.msg} onOk={() => { confirm.onOk(); setConfirm(null); }} onCancel={() => setConfirm(null)} />}
      {/* Sheet-view modals */}
      {modal === 'addEntry' && (
        <Modal title={`Add Entry — ${activeFlow.name}`} icon={<IconPlus />} onClose={() => setModal(null)}>
          <AddEntryBody form={entryForm} setForm={setEntryForm} flow={activeFlow} users={users} />
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn-primary" disabled={saving} onClick={saveEntry}>
              {saving ? 'Saving…' : 'Add Entry'}
            </button>
          </div>
        </Modal>
      )}
      {stepForm && (
        <Modal title={`Step ${stepForm.stepIdx + 1} Complete`} icon={<IconCheck />} onClose={() => setStepForm(null)}>
          <div className="p-6 space-y-4">
            <div className="bg-primary-50 rounded-xl px-4 py-3 text-[12px] text-primary-700 font-medium">
              {stepForm.stepName}
            </div>
            <div className="text-[12px] text-slate-500">
              Client: <span className="font-semibold text-slate-800">{stepForm.entry.client_name}</span>
              {stepForm.entry.skm_no && <span className="ml-2 text-slate-400">({stepForm.entry.skm_no})</span>}
            </div>
            <div>
              <label className="label">Completed By</label>
              <select className="input !text-[12px]" value={stepDoneBy} onChange={e => setStepDoneBy(e.target.value)}>
                <option value="">— Select —</option>
                {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setStepForm(null)}>Cancel</button>
            <button className="btn-primary" onClick={submitStepDone}>Mark Complete ✓</button>
          </div>
        </Modal>
      )}
      {modal === 'importSheet' && (
        <Modal title="Import Entries from Google Sheet" icon={<IconUpload />} onClose={() => { setModal(null); setImportUrl(''); setImportPreview(null); setImportErr(''); }}>
          <ImportBody
            url={importUrl} setUrl={setImportUrl}
            preview={importPreview} busy={importBusy} err={importErr}
            onPreview={previewImport}
            flowForm={flowForm} setFlowForm={setFlowForm}
            showFlowFields={false}
          />
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => { setModal(null); setImportUrl(''); setImportPreview(null); setImportErr(''); }}>Cancel</button>
            {importPreview && !importBusy && (
              <button className="btn-primary" onClick={confirmImport}>Import into {activeFlow.name}</button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Step Cell ────────────────────────────────────────────────────── */
function StepCell({ status, completedAt, completedBy, stepName, onClick }) {
  const title = status === 'done'
    ? `✓ Done${completedBy ? ' by ' + completedBy : ''}${completedAt ? '\n' + fmtDt(completedAt) : ''}\nClick to unmark`
    : status === 'overdue'
    ? `⚠ Overdue — ${stepName}\nClick to mark done`
    : status === 'pending'
    ? `Pending — ${stepName}\nClick to mark done`
    : stepName;

  const base = 'w-5 h-5 rounded mx-auto flex items-center justify-center transition-all duration-150';

  if (status === 'done') return (
    <div title={title} onClick={onClick} className={`${base} bg-emerald-500 cursor-pointer hover:bg-emerald-600 hover:scale-110 shadow-sm`}>
      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
    </div>
  );
  if (status === 'overdue') return (
    <div title={title} onClick={onClick} className={`${base} bg-orange-400 cursor-pointer hover:bg-orange-500 hover:scale-110 shadow-sm`}>
      <span className="text-white text-[8px] font-black leading-none">!</span>
    </div>
  );
  if (status === 'pending') return (
    <div title={title} onClick={onClick} className={`${base} bg-slate-200 cursor-pointer hover:bg-primary-200 hover:scale-110`} />
  );
  return <div title={title} className={`${base} bg-transparent border border-dashed border-slate-200`} />;
}

/* ── Confirm Modal ────────────────────────────────────────────────── */
function ConfirmModal({ msg, onOk, onCancel }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in">
        <div className="w-10 h-10 rounded-xl bg-red-50 grid place-items-center mx-auto mb-4">
          <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <p className="text-[13px] text-slate-700 text-center leading-relaxed mb-6">{msg}</p>
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onCancel}>Cancel</button>
          <button className="btn-danger flex-1" onClick={onOk}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal shell ──────────────────────────────────────────────────── */
function Modal({ title, icon, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            {icon || <IconLayers />}
          </div>
          <span className="text-[14px] font-semibold text-slate-900 font-display flex-1">{title}</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 text-[16px] shrink-0">✕</button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

/* ── Add Flow body ────────────────────────────────────────────────── */
function AddFlowBody({ form, setForm, users }) {
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const addStep = () => setForm(f => ({ ...f, steps: [...f.steps, ''] }));
  const setStep = (i, v) => setForm(f => { const s = [...f.steps]; s[i] = v; return { ...f, steps: s }; });
  const delStep = (i) => setForm(f => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }));

  return (
    <div className="p-6 space-y-4">
      <Field label="FMS Name *" value={form.name} onChange={v => upd('name', v)} placeholder="e.g. Factory O2D, Recruitment FMS…" />
      <div>
        <label className="label">Process Coordinator</label>
        <select className="input !text-[12px]" value={form.coordinator} onChange={e => upd('coordinator', e.target.value)}>
          <option value="">— Select Coordinator —</option>
          {users.map(u => (
            <option key={u.id} value={u.name}>{u.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Flow Color</label>
        <div className="flex gap-2 flex-wrap">
          {FLOW_COLORS.map(c => (
            <button key={c} onClick={() => upd('color', c)}
              className={`w-6 h-6 rounded-full border-2 transition ${form.color === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="label !mb-0">Steps</label>
          <button className="text-[11px] text-primary-600 hover:text-primary-700 font-semibold" onClick={addStep}>+ Add Step</button>
        </div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {form.steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 w-5 text-right shrink-0">{i+1}</span>
              <input value={s} onChange={e => setStep(i, e.target.value)} placeholder={`Step ${i+1} name…`} className="input !text-[12px] !py-1" />
              {form.steps.length > 1 && (
                <button onClick={() => delStep(i)} className="text-slate-300 hover:text-red-500 shrink-0 text-[14px]">✕</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Add Entry body ───────────────────────────────────────────────── */
function AddEntryBody({ form, setForm, flow, users }) {
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const TECHS = ['CNC','OVERLAY','INLAY','SLAB','PRINTING','HAND CASTED','SCOOPING','STAMPING','SAND BLASTING'];
  return (
    <div className="p-6 space-y-3">
      {/* Row 1: SKM + Order */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="SKM No"   value={form.skm_no}   onChange={v => upd('skm_no', v)}   placeholder="e.g. SKM-299" />
        <Field label="Order No" value={form.order_no}  onChange={v => upd('order_no', v)}  placeholder="e.g. B472 or H1663" />
      </div>
      {/* Row 2: Client */}
      <Field label="Client Name *" value={form.client_name} onChange={v => upd('client_name', v)} placeholder="Client name" />
      {/* Row 3: Area */}
      <Field label="Area" value={form.area} onChange={v => upd('area', v)} placeholder="Living Area, Pooja Mandir…" />
      {/* Row 4: Tech + SFT */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Technology</label>
          <select className="input !text-[12px]" value={form.technology} onChange={e => upd('technology', e.target.value)}>
            <option value="">Select…</option>
            {TECHS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <Field label="SFT" value={form.sft} onChange={v => upd('sft', v)} placeholder="Sq ft" />
      </div>
      {/* Row 5: Dates */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lead Date"    value={form.lead_date}    onChange={v => upd('lead_date', v)}    type="date" />
        <Field label="Planned Date" value={form.planned_date} onChange={v => upd('planned_date', v)} type="date" />
      </div>
      {/* Row 6: Doer dropdown */}
      <div>
        <label className="label">Doer (Assigned To)</label>
        <select className="input !text-[12px]" value={form.doer_name} onChange={e => upd('doer_name', e.target.value)}>
          <option value="">— Select Doer —</option>
          {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
        </select>
      </div>
      {/* Row 7: Current step */}
      {flow.steps.length > 0 && (
        <div>
          <label className="label">Current Step (pehle se complete ho chuka)</label>
          <select className="input !text-[12px]" value={form.current_step_idx ?? '0'} onChange={e => upd('current_step_idx', e.target.value)}>
            <option value="0">Step 1 se shuru (koi complete nahi)</option>
            {flow.steps.map((s, i) => (
              <option key={i} value={i + 1}>Step {i+1} tak complete — {s.length > 38 ? s.slice(0,38)+'…' : s}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/* ── Import body ──────────────────────────────────────────────────── */
function ImportBody({ url, setUrl, preview, busy, err, onPreview, flowForm, setFlowForm, showFlowFields }) {
  return (
    <div className="p-6 space-y-4">
      <div className="bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 text-[11.5px] text-primary-700 space-y-1">
        <div className="font-semibold">How to use:</div>
        <div>1. Share your Google Sheet with the service account email</div>
        <div>2. Paste the sheet URL below and click "Fetch Preview"</div>
        <div>3. Confirm columns are detected correctly, then import</div>
      </div>

      <div>
        <label className="label">Google Sheet URL</label>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="input !text-[12px]" />
      </div>

      <button className="btn-secondary w-full !text-[12px]" onClick={onPreview} disabled={busy || !url.trim()}>
        {busy ? 'Fetching…' : '🔍 Fetch Preview'}
      </button>

      {err && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-[12px] text-red-700">{err}</div>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3 text-center">
              <div className="text-[22px] font-black text-primary-600">{preview.rowCount}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Rows Found</div>
            </div>
            <div className="card p-3 text-center">
              <div className="text-[22px] font-black text-emerald-600">{preview.detectedSteps?.length || 0}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Steps Detected</div>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-slate-600 mb-1.5">Detected Steps:</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {(preview.detectedSteps || []).map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-slate-600">
                  <span className="text-[9px] font-bold bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full shrink-0">S{i+1}</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>

          {preview.detectedDoers?.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-600 mb-1.5">Doers Found:</div>
              <div className="flex flex-wrap gap-1.5">
                {preview.detectedDoers.map(d => (
                  <span key={d} className="pill bg-slate-100 text-slate-700">{d}</span>
                ))}
              </div>
            </div>
          )}

          {showFlowFields && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <Field label="FMS Name *" value={flowForm.name} onChange={v => setFlowForm(f => ({ ...f, name: v }))} placeholder="Name for this FMS flow" />
              <Field label="Coordinator" value={flowForm.coordinator} onChange={v => setFlowForm(f => ({ ...f, coordinator: v }))} placeholder={preview.detectedDoers?.[0] || 'Coordinator name'} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Shared sub-components ────────────────────────────────────────── */
function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="input !text-[12px]" />
    </div>
  );
}

function Select({ value, onChange, options, allLabel, valueMap }) {
  return (
    <select className="input !w-auto !text-[12px] !py-1.5" value={value}
      onChange={e => onChange(e.target.value)}>
      {options.map((opt, i) => (
        <option key={opt} value={valueMap ? valueMap[i] : (i === 0 ? 'All' : opt)}>
          {opt}
        </option>
      ))}
    </select>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────── */
function IconLayers() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>; }
function IconPlus()   { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function IconCheck()  { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>; }
function IconUpload() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>; }

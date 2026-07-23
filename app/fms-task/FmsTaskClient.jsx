'use client';
import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import FmsDoneModal from '../components/FmsDoneModal';

export default function FmsTaskClient() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.roles?.includes('Admin') || session?.user?.roles?.includes('HOD');
  // null access list = "not configured" → default allow, mirrors canAccess()/requireAccess() server-side.
  const canIntake = isAdmin || session?.user?.access == null || (session?.user?.access || []).includes('fms-intake');

  const [fmsList,      setFmsList]      = useState([]);
  const [loadingList,  setLoadingList]  = useState(true);
  const [selectedId,   setSelectedId]   = useState('');
  const [sheet,        setSheet]        = useState(null);
  const [steps,        setSteps]        = useState([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [activeStep,   setActiveStep]   = useState(null);
  const [rowsData,     setRowsData]     = useState(null);
  const [loadingRows,  setLoadingRows]  = useState(false);
  const [doneRow,      setDoneRow]      = useState(null);
  const [trainSpeed,   setTrainSpeed]   = useState(18);
  const [trainPaused,  setTrainPaused]  = useState(false);

  const [intakeFields, setIntakeFields] = useState([]);
  const [showIntakeForm, setShowIntakeForm] = useState(false);

  useEffect(() => { loadList(); }, []);

  async function loadList() {
    setLoadingList(true);
    const list = await fetch('/api/fms-tasks').then((r) => r.json()).catch(() => []);
    const arr = Array.isArray(list) ? list : [];
    setFmsList(arr);
    setLoadingList(false);
    if (arr.length === 1) setSelectedId(arr[0].id);
  }

  useEffect(() => {
    if (!selectedId) { setSheet(null); setSteps([]); setActiveStep(null); setRowsData(null); setIntakeFields([]); return; }
    let cancelled = false;
    setLoadingSteps(true);
    setActiveStep(null);
    setRowsData(null);
    setIntakeFields([]);
    fetch(`/api/fms-tasks/${selectedId}`).then((r) => r.json()).then((d) => {
      if (cancelled) return;
      setSheet(d.sheet || null);
      setSteps(d.steps || []);
      setLoadingSteps(false);
    }).catch(() => { if (!cancelled) setLoadingSteps(false); });
    if (canIntake) {
      fetch(`/api/fms-tasks/${selectedId}/intake`).then((r) => r.json()).then((d) => {
        if (!cancelled) setIntakeFields(d.fields || []);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [selectedId, canIntake]);

  function selectStep(step) {
    if (!step.isMyStep) return;
    setActiveStep(step);
    setRowsData(null);
  }

  async function loadRows() {
    if (!selectedId || !activeStep) return;
    setLoadingRows(true);
    const r = await fetch(`/api/fms-tasks/${selectedId}/steps/${activeStep.id}/rows`).then((res) => res.json()).catch((e) => ({ error: e.message }));
    setLoadingRows(false);
    setRowsData(r);
  }

  function afterDone() {
    setDoneRow(null);
    loadRows();
  }

  const trainSteps = useMemo(() => steps, [steps]);

  return (
    <div className="space-y-5 animate-fade-in">
      <style>{`
        @keyframes fmsTrainScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .fms-train-scroll { animation: fmsTrainScroll var(--train-dur, 18s) linear infinite; }
        .fms-train-scroll.paused { animation-play-state: paused; }
        .fms-train-scroll:hover { animation-play-state: paused; }
      `}</style>

      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
          <IconTrain className="w-[18px] h-[18px]" />
        </div>
        <div>
          <h1 className="font-display text-[18px] font-semibold tracking-tight text-slate-900">FMS Task</h1>
          <p className="text-[11.5px] text-slate-500">Pick a flow, click your step, mark rows done</p>
        </div>
      </div>

      {/* FMS selector */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <span className="text-[12.5px] font-semibold text-slate-600 shrink-0">Select FMS</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="input !w-auto min-w-[220px] flex-1"
          disabled={loadingList}
        >
          <option value="">{loadingList ? 'Loading…' : '— Select an FMS —'}</option>
          {fmsList.map((f) => <option key={f.id} value={f.id}>{f.fms_name || f.sheet_name}</option>)}
        </select>
        {selectedId && (
          <button onClick={() => loadList()} className="btn-secondary !text-[12px]">Refresh List</button>
        )}
        {selectedId && intakeFields.length > 0 && (
          <button onClick={() => setShowIntakeForm(true)} className="btn-primary !text-[12px]">+ New Entry</button>
        )}
      </div>

      {!loadingList && fmsList.length === 0 && (
        <div className="card p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-3">
            <IconTrain className="w-6 h-6 text-slate-400" />
          </div>
          <div className="text-[13.5px] font-semibold text-slate-700">No FMS assigned to you yet</div>
          <div className="text-[12px] text-slate-500 mt-0.5">Ask an admin to add you as a doer on an FMS step.</div>
        </div>
      )}

      {/* Train */}
      {selectedId && (
        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Process flow — click a step to view tasks</span>
            <span className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'linear-gradient(135deg,#F3C955,#B78A16)' }} /> Your step
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-500 opacity-50" /> Other step
              </span>
            </span>
          </div>

          <div className="rounded-2xl overflow-hidden relative"
            style={{ background: 'linear-gradient(180deg, #111111 0%, #000000 100%)', padding: '22px 0 32px' }}>
            {loadingSteps ? (
              <div className="text-[12px] text-slate-400 px-6 py-4">Loading steps…</div>
            ) : (
              <div className="flex items-end gap-1.5 px-8 w-max fms-train-scroll" style={{ '--train-dur': `${trainSpeed}s` }}>
                {[0, 1].map((dup) => (
                  <FmsTrain key={dup} steps={trainSteps} activeId={activeStep?.id} onSelect={selectStep} fmsName={sheet?.fms_name || sheet?.sheet_name} />
                ))}
              </div>
            )}
          </div>
          <div className="card !rounded-t-none px-5 py-2.5 flex items-center gap-3 text-[12px] text-slate-500">
            <span>🐢</span>
            <input type="range" min="5" max="60" value={trainSpeed} onChange={(e) => setTrainSpeed(Number(e.target.value))}
              className="flex-1 accent-primary-600" />
            <span>🐇</span>
            <span className="text-slate-700 font-semibold">{trainSpeed}s</span>
          </div>
        </div>
      )}

      {/* Step panel */}
      {activeStep && (
        <div className="space-y-3">
          <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Selected step</div>
              <div className="text-[15px] font-display font-semibold text-slate-900 mt-0.5">{activeStep.step_name}</div>
              <div className="text-[11.5px] text-slate-500 mt-0.5">👤 {activeStep.doers.map((d) => d.name).join(', ') || '—'}</div>
            </div>
            <div className="flex items-center gap-2.5">
              {rowsData && !rowsData.error && (
                <span className="pill bg-primary-50 text-primary-700 border border-primary-100">
                  {rowsData.total ? `${rowsData.total} pending` : 'All done'}
                </span>
              )}
              <button onClick={loadRows} disabled={loadingRows} className="btn-secondary">
                {loadingRows ? 'Loading…' : rowsData ? 'Refresh' : 'Load Tasks'}
              </button>
            </div>
          </div>

          {rowsData && (
            <FmsRowsTable
              rowsData={rowsData}
              onDone={(row) => setDoneRow(row)}
            />
          )}
        </div>
      )}

      {doneRow && (
        <FmsDoneModal
          row={doneRow}
          step={activeStep}
          onClose={() => setDoneRow(null)}
          onSaved={afterDone}
          fmsId={selectedId}
        />
      )}

      {showIntakeForm && (
        <IntakeFormModal
          fmsId={selectedId}
          fields={intakeFields}
          onClose={() => setShowIntakeForm(false)}
          onSaved={() => { setShowIntakeForm(false); if (activeStep) loadRows(); }}
        />
      )}
    </div>
  );
}

function IntakeFormModal({ fmsId, fields, onClose, onSaved }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const setVal = (id, v) => setValues((s) => ({ ...s, [id]: v }));

  async function submit() {
    setErr('');
    const missing = fields.find((f) => f.required && !String(values[f.id] || '').trim());
    if (missing) { setErr(`"${missing.field_label || missing.col_letter}" is required`); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/fms-tasks/${fmsId}/intake`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Failed to submit'); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 grid place-items-center shrink-0">📋</div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">New Entry</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Submitting adds a new row to this FMS's connected sheet</p>
          </div>
          <button onClick={onClose} disabled={saving} className="btn-ghost w-8 h-8 !p-0 shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-3">
          {err && <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12.5px] px-3 py-2">{err}</div>}
          {fields.map((f) => (
            <div key={f.id}>
              <label className="label">{f.field_label || f.col_letter}{f.required ? ' *' : ''}</label>
              {f.field_type === 'dropdown' ? (
                <select className="input" value={values[f.id] || ''} onChange={(e) => setVal(f.id, e.target.value)}>
                  <option value="">-- Select --</option>
                  {(f.dropdown_options || '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : f.field_type === 'link' ? 'url' : 'text'}
                  value={values[f.id] || ''}
                  onChange={(e) => setVal(f.id, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Submitting…' : 'Submit'}</button>
        </div>
      </div>
    </div>
  );
}

function FmsTrain({ steps, activeId, onSelect, fmsName }) {
  return (
    <>
      <div className="shrink-0 rounded-l-xl rounded-r-md px-4 py-3.5 text-white text-center min-w-[76px]"
        style={{ background: 'linear-gradient(135deg,#1F2937,#4B5563)', border: '2px solid #EEBC2E' }}>
        <div className="text-xl">🚂</div>
        <div className="text-[9px] mt-1 opacity-70 max-w-[70px] mx-auto truncate">{fmsName || ''}</div>
      </div>
      <span className="w-5 h-2 bg-slate-600 rounded-sm shrink-0 self-end mb-3.5" />
      {steps.map((s, i) => {
        const isMine = s.isMyStep;
        const isActive = s.id === activeId;
        return (
          <div key={s.id} className="flex items-end gap-1.5">
            <button
              onClick={() => onSelect(s)}
              title={isMine ? 'Click to view tasks' : 'Not your step'}
              className={`shrink-0 rounded-lg px-3.5 py-3 text-left min-w-[150px] max-w-[190px] transition-all duration-200 ${
                isMine ? 'cursor-pointer hover:-translate-y-1' : 'cursor-not-allowed opacity-55'
              }`}
              style={{
                background: isMine ? 'linear-gradient(135deg,#F3C955,#B78A16)' : '#1F2937',
                border: isActive ? '2px solid #FBEAB8' : '2px solid transparent',
                boxShadow: isActive ? '0 0 0 3px rgba(251,234,184,0.25)' : 'none',
                color: isMine ? '#241A03' : '#A3A3A3',
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">Step {s.step_order}</div>
              <div className="text-[12px] font-bold leading-snug mt-0.5 break-words">{s.step_name}</div>
              <div className="text-[10px] mt-1 opacity-75">👤 {s.doers.map((d) => d.name).join(', ') || '—'}</div>
              <div className="text-[9px] mt-1 opacity-60">{isMine ? '▶ Click to open' : '🔒 Not assigned'}</div>
            </button>
            {i < steps.length - 1 && <span className="w-5 h-2 bg-slate-600 rounded-sm shrink-0 self-end mb-3.5" />}
          </div>
        );
      })}
      <span className="w-8 shrink-0" />
    </>
  );
}

function FmsRowsTable({ rowsData, onDone }) {
  if (rowsData.error) {
    return <div className="card p-6 text-center text-[13px] text-red-600">{rowsData.error}</div>;
  }
  if (!rowsData.rows || !rowsData.rows.length) {
    return (
      <div className="card p-14 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 grid place-items-center mx-auto mb-3">
          <svg className="w-6 h-6 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>
        </div>
        <div className="text-[13.5px] font-semibold text-slate-700">
          {rowsData.filtered ? 'No rows assigned to you in this step!' : 'All done — no pending rows for this step!'}
        </div>
      </div>
    );
  }

  const colKeys = Object.keys(rowsData.rows[0].data);

  return (
    <div className="space-y-2">
      {rowsData.filtered && (
        <div className="rounded-lg bg-primary-50 border border-primary-100 text-primary-700 px-3.5 py-2.5 text-[12px]">
          🎯 <b>Showing only your assigned rows</b> — filtered by Col {rowsData.doerColumn} (Doer Name).
          {rowsData.totalPending > rowsData.total && (
            <span className="text-slate-500"> {rowsData.totalPending - rowsData.total} other row(s) belong to other doers.</span>
          )}
        </div>
      )}
      {!rowsData.filtered && rowsData.isAdmin && rowsData.doerColumn && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 text-amber-800 px-3.5 py-2.5 text-[12px]">
          👑 <b>Admin view</b> — showing all {rowsData.totalPending} pending rows across all doers (Col {rowsData.doerColumn}).
        </div>
      )}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
              <tr>
                <th className="table-th">Action</th>
                {colKeys.map((k) => <th key={k} className="table-th">{k}</th>)}
                <th className="table-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {rowsData.rows.map((row, ri) => (
                <tr key={ri} className="table-row">
                  <td className="table-td">
                    <button onClick={() => onDone(row)} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">✓ Done</button>
                  </td>
                  {colKeys.map((k) => <td key={k} className="table-td text-slate-700">{row.data[k] || '—'}</td>)}
                  <td className="table-td">
                    <span className="pill bg-amber-50 text-amber-700">⏳ Pending</span>
                    {row.rowDoerName && rowsData.isAdmin && (
                      <div className="text-[10px] text-slate-400 mt-0.5">→ {row.rowDoerName}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function IconTrain(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10h18M3 14h18M3 6h18M3 18h18" />
    </svg>
  );
}

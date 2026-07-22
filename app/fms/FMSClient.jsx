'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useConfirmToast } from '../components/ConfirmToast';

const FIELD_TYPES = [
  { value: 'text',     label: '📝 Text' },
  { value: 'number',   label: '🔢 Number' },
  { value: 'date',     label: '📅 Date' },
  { value: 'link',     label: '🔗 Link' },
  { value: 'dropdown', label: '🔽 Dropdown' },
];

function blankStep() {
  return {
    stepName: '', doers: [], planCol: '', actualCol: '',
    extraInput: 'no', extraCol: '', showCols: [], delayReasonCol: '', doerNameCol: '',
    extraRows: [],
  };
}

export default function FMSClient() {
  const { ask, ConfirmUI } = useConfirmToast();

  const [sheets,      setSheets]      = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId,    setActiveId]    = useState(null);
  const [detail,      setDetail]      = useState(null);
  const [loadingDet,  setLoadingDet]  = useState(false);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [users,       setUsers]       = useState([]);

  const [modal,   setModal]   = useState(null); // 'add' | 'edit' | null
  const [form,    setForm]    = useState(null);
  const [headers, setHeaders] = useState([]);
  const [headersLoading, setHeadersLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  useEffect(() => { loadSheets(); loadUsers(); }, []);

  async function loadUsers() {
    const list = await fetch('/api/users').then((r) => r.json()).catch(() => []);
    setUsers(Array.isArray(list) ? list : []);
  }

  async function loadSheets() {
    setLoadingList(true);
    const list = await fetch('/api/fms').then((r) => r.json()).catch(() => []);
    const arr = Array.isArray(list) ? list : [];
    setSheets(arr);
    setLoadingList(false);
    if (!activeId && arr.length) setActiveId(arr[0].id);
  }

  useEffect(() => {
    if (!activeId) { setDetail(null); return; }
    let cancelled = false;
    setLoadingDet(true);
    setActiveStepIdx(0);
    fetch(`/api/fms/${activeId}`).then((r) => r.json()).then((d) => {
      if (cancelled) return;
      setDetail(d);
      setLoadingDet(false);
    }).catch(() => { if (!cancelled) setLoadingDet(false); });
    return () => { cancelled = true; };
  }, [activeId]);

  function openAdd() {
    setForm({ fmsName: '', sheetName: '', sheetId: '', headerRow: 1, steps: [blankStep()] });
    setHeaders([]);
    setErr('');
    setModal('add');
  }

  async function openEdit() {
    if (!detail) return;
    setForm({
      fmsName: detail.sheet.fms_name || detail.sheet.sheet_name,
      sheetName: detail.sheet.sheet_name, sheetId: detail.sheet.sheet_id,
      headerRow: detail.sheet.header_row || 1,
      steps: detail.steps.map((s) => ({
        stepName: s.step_name,
        doers: s.doers.map((d) => d.user_id),
        planCol: s.plan_col || '', actualCol: s.actual_col || '',
        extraInput: s.extra_input || 'no', extraCol: s.extra_col || '',
        showCols: s.show_cols_parsed || [],
        delayReasonCol: s.delay_reason_col || '', doerNameCol: s.doer_name_col || '',
        extraRows: (s.extraRows || []).map((r) => ({
          label: r.row_label || r.col_letter, col_letter: r.col_letter,
          field_type: r.field_type || 'text', dropdown_options: r.dropdown_options || '',
          required: r.required == null ? 1 : (r.required ? 1 : 0),
        })),
      })),
    });
    setErr('');
    setModal('edit');
    setHeaders([]);
    if (detail.sheet.sheet_id) await fetchHeaders(detail.sheet.sheet_id, detail.sheet.sheet_name, detail.sheet.header_row);
  }

  function closeModal() { setModal(null); setForm(null); setHeaders([]); }

  async function fetchHeaders(sheetId, sheetName, headerRow) {
    setHeadersLoading(true);
    const r = await fetch('/api/fms/fetch-headers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, sheetName, headerRow }),
    }).then((res) => res.json()).catch((e) => ({ error: e.message }));
    setHeadersLoading(false);
    if (r.error) { setErr(r.error); return; }
    setHeaders(r.headers || []);
  }

  function updateStep(i, patch) {
    setForm((f) => ({ ...f, steps: f.steps.map((s, si) => (si === i ? { ...s, ...patch } : s)) }));
  }
  function addStep() { setForm((f) => ({ ...f, steps: [...f.steps, blankStep()] })); }
  function removeStep(i) { setForm((f) => ({ ...f, steps: f.steps.filter((_, si) => si !== i) })); }
  function duplicateStep(i) {
    setForm((f) => {
      const copy = JSON.parse(JSON.stringify(f.steps[i]));
      copy.stepName = copy.stepName + ' (copy)';
      const steps = [...f.steps]; steps.splice(i + 1, 0, copy);
      return { ...f, steps };
    });
  }
  function moveStep(i, dir) {
    setForm((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.steps.length) return f;
      const steps = [...f.steps];
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...f, steps };
    });
  }

  async function save() {
    setErr('');
    if (!form.sheetName.trim()) { setErr('Google Sheet Tab Name required'); return; }
    if (!form.sheetId.trim())   { setErr('Google Sheet ID required'); return; }
    if (form.steps.some((s) => !s.stepName.trim())) { setErr('Please name every step'); return; }
    setSaving(true);
    try {
      const url = modal === 'edit' ? `/api/fms/${activeId}` : '/api/fms';
      const method = modal === 'edit' ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Failed to save'); setSaving(false); return; }
      closeModal();
      await loadSheets();
      if (d.id) setActiveId(d.id);
      else if (activeId) {
        const dd = await fetch(`/api/fms/${activeId}`).then((r) => r.json());
        setDetail(dd);
      }
    } finally { setSaving(false); }
  }

  function deleteSheet() {
    if (!detail) return;
    ask(`Delete "${detail.sheet.fms_name || detail.sheet.sheet_name}"? Step config is removed — the Google Sheet itself is untouched.`, async () => {
      await fetch(`/api/fms/${activeId}`, { method: 'DELETE' });
      setActiveId(null);
      loadSheets();
    });
  }

  const step = detail?.steps?.[activeStepIdx];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconLayers /></div>
          <div>
            <div className="section-title">FMS Admin</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{sheets.length} flow{sheets.length === 1 ? '' : 's'} · each points at a live Google Sheet</div>
          </div>
        </div>
        <button className="btn-primary !text-[12px]" onClick={openAdd}><PlusIcon /> Add New FMS</button>
      </div>

      {loadingList ? (
        <div className="card p-10 text-center text-slate-400 text-[13px]">Loading…</div>
      ) : sheets.length === 0 ? (
        <div className="card p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3"><IconLayers className="text-primary-500" /></div>
          <div className="text-[13.5px] font-semibold text-slate-700">No FMS flows yet</div>
          <div className="text-[12px] text-slate-500 mt-0.5">Click "Add New FMS" to point at your first Google Sheet.</div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {sheets.map((s) => (
              <button key={s.id} onClick={() => setActiveId(s.id)}
                className={`seg-btn ${activeId === s.id ? 'seg-btn-active' : 'bg-white border border-slate-200'}`}>
                {s.fms_name || s.sheet_name}
              </button>
            ))}
          </div>

          {loadingDet ? (
            <div className="card p-10 text-center text-slate-400 text-[13px]">Loading…</div>
          ) : detail && (
            <>
              <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Sheet Info</div>
                  <div className="text-[12.5px] text-slate-700 mt-0.5">
                    <b>{detail.sheet.sheet_name}</b> · Sheet ID: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{detail.sheet.sheet_id}</code> · Header Row: {detail.sheet.header_row}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary !text-[12px]" onClick={openEdit}>✏️ Edit FMS</button>
                  <button className="btn-danger !text-[12px]" onClick={deleteSheet}>🗑 Delete</button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {detail.steps.map((s, i) => (
                  <button key={s.id} onClick={() => setActiveStepIdx(i)}
                    className={`seg-btn !text-[11.5px] ${activeStepIdx === i ? 'seg-btn-active' : 'bg-white border border-slate-200'}`}>
                    {s.step_name}
                  </button>
                ))}
              </div>

              {step && (
                <div className="card p-5">
                  <div className="grid grid-cols-2 gap-4">
                    <Detail label="Step Name" value={step.step_name} />
                    <Detail label="Step Doer(s)" value={step.doers.map((d) => d.name).join(', ') || '—'} />
                    <Detail label="Plan Column" value={step.plan_col || '—'} />
                    <Detail label="Actual Column" value={step.actual_col || '—'} />
                    <Detail label="Delay Reason Column" value={step.delay_reason_col || '—'} />
                    <Detail label="Doer Name Column" value={step.doer_name_col || '—'} />
                  </div>
                  {step.extraRows?.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="label !mb-2">Extra Input Fields</div>
                      <div className="space-y-1">
                        {step.extraRows.map((r) => (
                          <div key={r.id} className="text-[12.5px] text-slate-600">• {r.row_label || r.col_letter} <span className="text-slate-400">(COL {r.col_letter}, {r.field_type})</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                    {activeStepIdx > 0 && <button className="btn-secondary !text-[12px]" onClick={() => setActiveStepIdx((i) => i - 1)}>← Prev Step</button>}
                    {activeStepIdx < detail.steps.length - 1 && <button className="btn-primary !text-[12px]" onClick={() => setActiveStepIdx((i) => i + 1)}>Next Step →</button>}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {ConfirmUI}

      {modal && form && createPortal(
        <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={() => !saving && closeModal()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconLayers /></div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900">{modal === 'edit' ? 'Edit FMS' : 'New FMS Flow'}</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">Point at a Google Sheet, then configure each step's columns</p>
              </div>
              <button className="btn-secondary !text-[12px]" onClick={addStep}>+ Add Step</button>
              <button onClick={closeModal} disabled={saving} className="btn-ghost w-8 h-8 !p-0 shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {err && <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12.5px] px-3 py-2">{err}</div>}

              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="label">FMS Name <span className="text-slate-400 font-normal normal-case">(display name)</span></label>
                  <input className="input" value={form.fmsName} onChange={(e) => setForm((f) => ({ ...f, fmsName: e.target.value }))} placeholder="e.g. Factory O2D, Recruitment FMS…" />
                </div>
                <div>
                  <label className="label">Google Sheet Tab Name</label>
                  <input className="input" value={form.sheetName} onChange={(e) => setForm((f) => ({ ...f, sheetName: e.target.value }))} placeholder="e.g. Sheet1" />
                </div>
                <div>
                  <label className="label">Google Sheet ID <span className="text-slate-400 font-normal normal-case">(or full URL)</span></label>
                  <input className="input" value={form.sheetId} onChange={(e) => setForm((f) => ({ ...f, sheetId: e.target.value }))} placeholder="Sheet ID or full URL" />
                </div>
                <div>
                  <label className="label">Header Row</label>
                  <input type="number" min="1" className="input" value={form.headerRow} onChange={(e) => setForm((f) => ({ ...f, headerRow: Number(e.target.value) || 1 }))} />
                </div>
                <div className="col-span-2">
                  <button className="btn-secondary w-full !text-[12px]" disabled={headersLoading || !form.sheetId.trim()}
                    onClick={() => fetchHeaders(form.sheetId, form.sheetName, form.headerRow)}>
                    {headersLoading ? 'Fetching…' : headers.length ? `✅ ${headers.length} columns loaded — click to refetch` : '🔍 Fetch Column Headers'}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {form.steps.map((s, i) => (
                  <StepBox key={i} idx={i} step={s} total={form.steps.length} headers={headers} users={users}
                    onChange={(patch) => updateStep(i, patch)}
                    onRemove={() => removeStep(i)} onDuplicate={() => duplicateStep(i)}
                    onMove={(dir) => moveStep(i, dir)}
                    fmsSheetId={form.sheetId} fmsSheetName={form.sheetName} fmsHeaderRow={form.headerRow}
                    onLoadedDoers={(userIds) => updateStep(i, { doers: [...new Set([...s.doers, ...userIds])] })}
                  />
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center shrink-0">
              <span className="text-[11.5px] text-slate-400">{form.steps.length} step{form.steps.length === 1 ? '' : 's'}</span>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : modal === 'edit' ? '💾 Save Changes' : '💾 Create FMS'}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function StepBox({ idx, step, total, headers, users, onChange, onRemove, onDuplicate, onMove, fmsSheetId, fmsSheetName, fmsHeaderRow, onLoadedDoers }) {
  const [doerDropOpen, setDoerDropOpen] = useState(false);
  const [loadingDoers, setLoadingDoers] = useState(false);
  const [loadDoersMsg, setLoadDoersMsg] = useState('');

  const colOptions = (value, onPick) => (
    headers.length ? (
      <select className="input !text-[12px]" value={value} onChange={(e) => onPick(e.target.value)}>
        <option value="">-- Select Column --</option>
        {headers.map((h) => <option key={h.col} value={h.col}>{h.name} (COL {h.col})</option>)}
      </select>
    ) : (
      <input className="input !text-[12px]" value={value} onChange={(e) => onPick(e.target.value)} placeholder="Column e.g. I" />
    )
  );

  async function loadDoersFromColumn() {
    if (!step.doerNameCol || !fmsSheetId) return;
    setLoadingDoers(true); setLoadDoersMsg('');
    const r = await fetch(`/api/fms/sheet-column-values?sheetId=${encodeURIComponent(fmsSheetId)}&tabName=${encodeURIComponent(fmsSheetName)}&col=${encodeURIComponent(step.doerNameCol)}&headerRow=${fmsHeaderRow}`)
      .then((res) => res.json()).catch((e) => ({ error: e.message }));
    setLoadingDoers(false);
    if (r.error) { setLoadDoersMsg('❌ ' + r.error); return; }
    onLoadedDoers(r.matched.map((m) => m.user_id));
    setLoadDoersMsg(`✅ Matched ${r.matched.length}/${r.total_unique}${r.unmatched.length ? ` — unmatched: ${r.unmatched.join(', ')}` : ''}`);
  }

  const toggleDoer = (uid) => {
    const has = step.doers.includes(uid);
    onChange({ doers: has ? step.doers.filter((d) => d !== uid) : [...step.doers, uid] });
  };
  const doerNames = users.filter((u) => step.doers.includes(u.id)).map((u) => u.name);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 relative">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[11px] font-bold text-primary-600 uppercase tracking-wide">Step {idx + 1}</div>
        <div className="ml-auto flex items-center gap-1">
          <button title="Move up" disabled={idx === 0} onClick={() => onMove(-1)} className="btn-ghost !p-1.5 disabled:opacity-30">▲</button>
          <button title="Move down" disabled={idx === total - 1} onClick={() => onMove(1)} className="btn-ghost !p-1.5 disabled:opacity-30">▼</button>
          <button title="Duplicate" onClick={onDuplicate} className="btn-ghost !p-1.5 text-violet-500">📋</button>
          <button title="Delete step" disabled={total === 1} onClick={onRemove} className="btn-ghost !p-1.5 text-red-500 disabled:opacity-30">🗑</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Step Name</label>
          <input className="input !text-[12px]" value={step.stepName} onChange={(e) => onChange({ stepName: e.target.value })} placeholder="Step Name" />
        </div>
        <div className="relative">
          <label className="label">Step Doer(s)</label>
          <div onClick={() => setDoerDropOpen((v) => !v)}
            className="input !text-[12px] cursor-pointer flex flex-wrap gap-1 min-h-[34px] items-center">
            {doerNames.length ? doerNames.map((n) => <span key={n} className="pill bg-primary-50 text-primary-700 !text-[10px]">{n}</span>) : <span className="text-slate-400">Select users…</span>}
          </div>
          {doerDropOpen && (
            <div className="absolute z-20 mt-1 w-full max-h-[180px] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-elevated">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={step.doers.includes(u.id)} onChange={() => toggleDoer(u.id)} className="accent-primary-600" />
                  {u.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="label">Plan <span className="text-slate-400 font-normal normal-case">(Plan {idx + 1})</span></label>
          {colOptions(step.planCol, (v) => onChange({ planCol: v }))}
        </div>
        <div>
          <label className="label">Actual <span className="text-slate-400 font-normal normal-case">(Actual {idx + 1})</span></label>
          {colOptions(step.actualCol, (v) => onChange({ actualCol: v }))}
        </div>
      </div>

      <div className="mt-3">
        <label className="label">Columns to Show in FMS Tasks <span className="text-slate-400 font-normal normal-case">(blank = show all)</span></label>
        {headers.length ? (
          <div className="flex flex-wrap gap-1.5 p-2 border border-slate-200 rounded-lg bg-white max-h-[120px] overflow-y-auto">
            {headers.map((h) => (
              <label key={h.index} className="flex items-center gap-1 text-[11px] font-medium bg-slate-50 border border-slate-200 rounded-md px-2 py-1 cursor-pointer">
                <input type="checkbox" checked={step.showCols.includes(h.index)}
                  onChange={(e) => onChange({ showCols: e.target.checked ? [...step.showCols, h.index] : step.showCols.filter((x) => x !== h.index) })}
                  className="accent-primary-600 w-3 h-3" />
                {h.name}
              </label>
            ))}
          </div>
        ) : <span className="text-[11.5px] text-slate-400">Will show once headers are loaded</span>}
      </div>

      <div className="mt-3">
        <label className="label">Delay Reason Column <span className="text-slate-400 font-normal normal-case">(where delay reason is saved)</span></label>
        {(() => {
          const val = step.delayReasonCol;
          return headers.length ? (
            <select className="input !text-[12px]" value={val} onChange={(e) => onChange({ delayReasonCol: e.target.value })}>
              <option value="">-- None --</option>
              {headers.map((h) => <option key={h.col} value={h.col}>{h.name} (COL {h.col})</option>)}
            </select>
          ) : (
            <input className="input !text-[12px]" value={val} onChange={(e) => onChange({ delayReasonCol: e.target.value })} placeholder="e.g. K" />
          );
        })()}
      </div>

      <div className="mt-3">
        <label className="label">Doer Name Column <span className="text-slate-400 font-normal normal-case">(auto-saved on completion)</span></label>
        <div className="flex gap-2">
          {headers.length ? (
            <select className="input !text-[12px] flex-1" value={step.doerNameCol} onChange={(e) => onChange({ doerNameCol: e.target.value })}>
              <option value="">-- None --</option>
              {headers.map((h) => <option key={h.col} value={h.col}>{h.name} (COL {h.col})</option>)}
            </select>
          ) : (
            <input className="input !text-[12px] flex-1" value={step.doerNameCol} onChange={(e) => onChange({ doerNameCol: e.target.value })} placeholder="e.g. L" />
          )}
          <button type="button" onClick={loadDoersFromColumn} disabled={loadingDoers || !step.doerNameCol}
            className="btn-success !text-[11px] !px-3 whitespace-nowrap">
            {loadingDoers ? '…' : '🔄 Load Doers'}
          </button>
        </div>
        {loadDoersMsg && <div className="text-[11px] mt-1.5 text-slate-500">{loadDoersMsg}</div>}
      </div>

      <div className="mt-3">
        <label className="label">Extra Input</label>
        <select className="input !text-[12px] !w-auto" value={step.extraInput} onChange={(e) => onChange({ extraInput: e.target.value })}>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </div>

      {step.extraInput === 'yes' && (
        <div className="mt-3 rounded-lg bg-primary-50/60 p-3 space-y-2.5">
          {step.extraRows.map((r, ri) => (
            <ExtraRowConfig key={ri} row={r} headers={headers}
              onChange={(patch) => onChange({ extraRows: step.extraRows.map((er, eri) => (eri === ri ? { ...er, ...patch } : er)) })}
              onRemove={() => onChange({ extraRows: step.extraRows.filter((_, eri) => eri !== ri) })}
            />
          ))}
          <button type="button" className="btn-secondary !text-[11px]" onClick={() => onChange({ extraRows: [...step.extraRows, { label: '', col_letter: '', field_type: 'text', dropdown_options: '', required: 1 }] })}>
            + Add Row
          </button>
        </div>
      )}
    </div>
  );
}

function ExtraRowConfig({ row, headers, onChange, onRemove }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-2.5 grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-2 items-start">
      {headers.length ? (
        <select className="input !text-[11.5px]" value={row.col_letter} onChange={(e) => {
          const h = headers.find((x) => x.col === e.target.value);
          onChange({ col_letter: e.target.value, label: row.label || h?.name || '' });
        }}>
          <option value="">-- Column --</option>
          {headers.map((h) => <option key={h.col} value={h.col}>{h.name} (COL {h.col})</option>)}
        </select>
      ) : (
        <input className="input !text-[11.5px]" value={row.col_letter} onChange={(e) => onChange({ col_letter: e.target.value })} placeholder="Col e.g. AS" />
      )}
      <input className="input !text-[11.5px]" value={row.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="Label" />
      <select className="input !text-[11.5px]" value={row.field_type} onChange={(e) => onChange({ field_type: e.target.value })}>
        {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <label className="flex items-center gap-1 text-[10.5px] text-slate-500 whitespace-nowrap pt-2">
        <input type="checkbox" checked={!!row.required} onChange={(e) => onChange({ required: e.target.checked ? 1 : 0 })} className="accent-primary-600" />
        Req.
      </label>
      <button type="button" onClick={onRemove} className="btn-ghost !p-1.5 text-red-500">✕</button>
      {row.field_type === 'dropdown' && (
        <input className="input !text-[11.5px] col-span-5" value={row.dropdown_options} onChange={(e) => onChange({ dropdown_options: e.target.value })} placeholder="Comma-separated options e.g. Yes,No,Partial" />
      )}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-[13px] text-slate-800 mt-1">{value}</div>
    </div>
  );
}

function PlusIcon() { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>; }
function IconLayers(props) { return <svg {...props} className={`w-[18px] h-[18px] ${props.className || ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></svg>; }

'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { useConfirmToast } from '../components/ConfirmToast';
import PcView from './PcView';

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
  const { data: session } = useSession();
  const isAdmin = session?.user?.roles?.includes('Admin') || session?.user?.roles?.includes('HOD');
  // access list null/unconfigured → default allow, same rule as canAccess()/canSee() in lib/pages.js
  const canSubmitIntake = isAdmin || session?.user?.access == null || (session?.user?.access || []).includes('fms-intake');

  const [sheets,      setSheets]      = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId,    setActiveId]    = useState(null);
  const [detail,      setDetail]      = useState(null);
  const [loadingDet,  setLoadingDet]  = useState(false);
  const [users,       setUsers]       = useState([]);

  // PC Report (pending across every step) — fetched on demand the first time
  // it's opened for a given FMS, reset whenever the selected FMS changes.
  const [showPc,     setShowPc]     = useState(false);
  const [pcItems,    setPcItems]    = useState(null);
  const [loadingPc,  setLoadingPc]  = useState(false);

  const [modal,   setModal]   = useState(null); // 'add' | 'edit' | null
  const [form,    setForm]    = useState(null);
  const [headers, setHeaders] = useState([]);
  const [headersLoading, setHeadersLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  // Intake form ("starting form" that appends a brand-new row) config modal
  const [showIntake, setShowIntake] = useState(false);
  const [intakeFields, setIntakeFields] = useState([]);
  const [intakeHeaders, setIntakeHeaders] = useState([]);
  const [intakeHeadersLoading, setIntakeHeadersLoading] = useState(false);
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [intakeErr, setIntakeErr] = useState('');

  // Intake form SUBMIT (fill it in + append a row) — separate from the admin
  // config modal above. submitFields is fetched per FMS just to know whether
  // a form is configured at all (and to render it), gated server-side by
  // requireAccess('fms-intake') on GET /api/fms-tasks/[id]/intake.
  const [submitFields, setSubmitFields] = useState([]);
  const [showSubmitForm, setShowSubmitForm] = useState(false);

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
    setShowPc(false);
    setPcItems(null);
    setSubmitFields([]);
    fetch(`/api/fms/${activeId}`).then((r) => r.json()).then((d) => {
      if (cancelled) return;
      setDetail(d);
      setLoadingDet(false);
    }).catch(() => { if (!cancelled) setLoadingDet(false); });
    if (canSubmitIntake) {
      fetch(`/api/fms-tasks/${activeId}/intake`).then((r) => r.json()).then((d) => {
        if (!cancelled) setSubmitFields(d.fields || []);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [activeId, canSubmitIntake]);

  function loadPc() {
    setLoadingPc(true);
    fetch(`/api/fms/${activeId}/pc`).then((r) => r.json()).then((d) => {
      setPcItems(d.items || []); setLoadingPc(false);
    }).catch(() => setLoadingPc(false));
  }
  function togglePc() {
    setShowPc((v) => !v);
    if (pcItems == null && !loadingPc) loadPc();
  }

  function openAdd() {
    setForm({ fmsName: '', sheetName: '', sheetId: '', headerRow: 1, processCoordinatorId: '', steps: [blankStep()] });
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
      processCoordinatorId: detail.sheet.process_coordinator_id || '',
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

  async function openIntake() {
    if (!detail) return;
    setIntakeErr('');
    setShowIntake(true);
    setIntakeHeaders([]);
    setIntakeHeadersLoading(true);
    const [fieldsRes, headersRes] = await Promise.all([
      fetch(`/api/fms/${activeId}/intake-fields`).then((r) => r.json()).catch((e) => ({ error: e.message })),
      fetch('/api/fms/fetch-headers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId: detail.sheet.sheet_id, sheetName: detail.sheet.sheet_name, headerRow: detail.sheet.header_row }),
      }).then((r) => r.json()).catch((e) => ({ error: e.message })),
    ]);
    setIntakeHeadersLoading(false);
    if (fieldsRes.error) { setIntakeErr(fieldsRes.error); return; }
    if (headersRes.error) { setIntakeErr(headersRes.error); return; }
    setIntakeFields((fieldsRes.fields || []).map((f) => ({
      label: f.field_label || f.col_letter, col_letter: f.col_letter,
      field_type: f.field_type || 'text', dropdown_options: f.dropdown_options || '',
      required: f.required == null ? 1 : (f.required ? 1 : 0),
    })));
    setIntakeHeaders(headersRes.headers || []);
  }
  function closeIntake() { setShowIntake(false); setIntakeFields([]); setIntakeHeaders([]); }
  function updateIntakeField(i, patch) {
    setIntakeFields((fs) => fs.map((f, fi) => (fi === i ? { ...f, ...patch } : f)));
  }
  function addIntakeField() {
    setIntakeFields((fs) => [...fs, { label: '', col_letter: '', field_type: 'text', dropdown_options: '', required: 1 }]);
  }
  function removeIntakeField(i) {
    setIntakeFields((fs) => fs.filter((_, fi) => fi !== i));
  }
  async function saveIntake() {
    setIntakeErr('');
    if (intakeFields.some((f) => !f.col_letter)) { setIntakeErr('Every field needs a column'); return; }
    setIntakeSaving(true);
    try {
      const res = await fetch(`/api/fms/${activeId}/intake-fields`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: intakeFields }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setIntakeErr(d.error || 'Failed to save'); return; }
      closeIntake();
    } finally { setIntakeSaving(false); }
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

  const sheetUrl = detail?.sheet?.sheet_id ? `https://docs.google.com/spreadsheets/d/${detail.sheet.sheet_id}/edit` : null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconLayers /></div>
          <div>
            <div className="section-title">FMS</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{sheets.length} flow{sheets.length === 1 ? '' : 's'} · each points at a live Google Sheet</div>
          </div>
        </div>
        {isAdmin && <button className="btn-primary !text-[12px]" onClick={openAdd}><PlusIcon /> Add New FMS</button>}
      </div>

      {loadingList ? (
        <div className="card p-10 text-center text-slate-400 text-[13px]">Loading…</div>
      ) : sheets.length === 0 ? (
        <div className="card p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3"><IconLayers className="text-primary-500" /></div>
          <div className="text-[13.5px] font-semibold text-slate-700">No FMS flows {isAdmin ? 'yet' : 'visible to you yet'}</div>
          <div className="text-[12px] text-slate-500 mt-0.5">
            {isAdmin ? 'Click "Add New FMS" to point at your first Google Sheet.' : 'Ask an admin to add you as a doer on an FMS step.'}
          </div>
        </div>
      ) : (
        <>
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className="table-th">FMS Name</th>
                  <th className="table-th">Steps</th>
                  <th className="table-th">Pending</th>
                  <th className="table-th">Coordinator</th>
                  <th className="table-th">Sheet</th>
                  <th className="table-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => {
                  const isActive = activeId === s.id;
                  return (
                    <tr key={s.id} onClick={() => setActiveId(s.id)}
                      className={`table-row cursor-pointer ${isActive ? 'bg-primary-50/60' : ''}`}>
                      <td className="table-td font-semibold text-slate-800 whitespace-nowrap">{s.fms_name || s.sheet_name}</td>
                      <td className="table-td">{s.totalSteps ?? 0}</td>
                      <td className="table-td">{s.totalPending ?? 0}</td>
                      <td className="table-td text-slate-500">{s.coordinatorName || '—'}</td>
                      <td className="table-td whitespace-nowrap">
                        {isActive && sheetUrl && (
                          <a href={sheetUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                            className="text-primary-600 hover:underline">🔗 {detail?.sheet?.sheet_name} ↗</a>
                        )}
                      </td>
                      <td className="table-td">
                        {isActive && (
                          loadingDet ? (
                            <span className="text-slate-400 text-[12px]">Loading…</span>
                          ) : detail && (
                            <div className="flex gap-2 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                              <button className="btn-secondary !text-[12px]" onClick={togglePc}>👤 {showPc ? 'Hide' : ''} PC Report</button>
                              {canSubmitIntake && submitFields.length > 0 && (
                                <button className="btn-primary !text-[12px]" onClick={() => setShowSubmitForm(true)}>📝 Submit Entry</button>
                              )}
                              {isAdmin && (
                                <>
                                  <button className="btn-secondary !text-[12px]" onClick={openIntake}>📋 Intake Form</button>
                                  <button className="btn-secondary !text-[12px]" onClick={openEdit}>✏️ Edit</button>
                                  <button className="btn-danger !text-[12px]" onClick={deleteSheet}>🗑 Delete</button>
                                </>
                              )}
                            </div>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {showPc && (
            loadingPc || pcItems == null ? (
              <div className="card p-10 text-center text-slate-400 text-[13px]">Loading pending entries…</div>
            ) : (
              <PcView items={pcItems} />
            )
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
                <div>
                  <label className="label">Process Coordinator</label>
                  <select className="input" value={form.processCoordinatorId} onChange={(e) => setForm((f) => ({ ...f, processCoordinatorId: e.target.value }))}>
                    <option value="">-- None --</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
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

      {showIntake && createPortal(
        <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={() => !intakeSaving && closeIntake()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 grid place-items-center shrink-0">📋</div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900">Intake Form</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">The "starting form" — submitting it appends a brand-new row to this FMS's sheet</p>
              </div>
              <button onClick={closeIntake} disabled={intakeSaving} className="btn-ghost w-8 h-8 !p-0 shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-3 overflow-y-auto flex-1">
              {intakeErr && <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12.5px] px-3 py-2">{intakeErr}</div>}
              {intakeHeadersLoading ? (
                <div className="text-center text-slate-400 text-[13px] py-6">Loading…</div>
              ) : (
                <>
                  {intakeFields.length === 0 && (
                    <div className="text-[12.5px] text-slate-500">No fields yet — add one for each column you want on the form (e.g. Client Name, Contact Number, Lead Source).</div>
                  )}
                  <div className="space-y-2.5">
                    {intakeFields.map((f, i) => (
                      <ExtraRowConfig key={i} row={f} headers={intakeHeaders}
                        onChange={(patch) => updateIntakeField(i, patch)}
                        onRemove={() => removeIntakeField(i)}
                      />
                    ))}
                  </div>
                  <button type="button" className="btn-secondary !text-[11px]" onClick={addIntakeField}>+ Add Field</button>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center shrink-0">
              <span className="text-[11.5px] text-slate-400">{intakeFields.length} field{intakeFields.length === 1 ? '' : 's'}</span>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={closeIntake} disabled={intakeSaving}>Cancel</button>
                <button className="btn-primary" onClick={saveIntake} disabled={intakeSaving || intakeHeadersLoading}>{intakeSaving ? 'Saving…' : '💾 Save'}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSubmitForm && createPortal(
        <IntakeFormModal
          fmsId={activeId}
          fields={submitFields}
          onClose={() => setShowSubmitForm(false)}
          onSaved={() => { setShowSubmitForm(false); if (showPc) loadPc(); }}
        />,
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

// Fill-in-and-submit form for the intake fields an admin configured — appends
// a brand-new row to the FMS's connected sheet. Distinct from the admin
// config modal above (that one edits which fields exist; this one fills them in).
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
          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 grid place-items-center shrink-0">📝</div>
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

function PlusIcon() { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>; }
function IconLayers(props) { return <svg {...props} className={`w-[18px] h-[18px] ${props.className || ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></svg>; }

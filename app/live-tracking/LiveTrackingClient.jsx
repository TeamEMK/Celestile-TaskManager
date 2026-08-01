'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useConfirmToast } from '../components/ConfirmToast';

const blankForm = () => ({ name: '', sheetLink: '', sheetName: '', headerRow: 1 });
const REFRESH_MS = 30000;
const isLinkValue = (s) => /^https?:\/\/\S+$/i.test(s);

export default function LiveTrackingClient() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.roles?.includes('Admin') || session?.user?.roles?.includes('HOD');
  const { ask, ConfirmUI } = useConfirmToast();

  const [list, setList]           = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId]   = useState(null);

  const [data, setData]           = useState(null); // { tracker, headers, rows }
  const [loadingData, setLoadingData] = useState(false);
  const [dataErr, setDataErr]     = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [q, setQ] = useState('');

  const [modal, setModal] = useState(null); // 'add' | 'edit' | null
  const [form, setForm]   = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  useEffect(() => { loadList(); }, []);

  async function loadList() {
    setLoadingList(true);
    const list = await fetch('/api/live-tracking').then((r) => r.json()).catch(() => []);
    const arr = Array.isArray(list) ? list : [];
    setList(arr);
    setLoadingList(false);
    setActiveId((cur) => cur && arr.some((s) => s.id === cur) ? cur : (arr[0]?.id || null));
  }

  const loadData = useCallback((silent = false) => {
    if (!activeId) return;
    if (!silent) { setLoadingData(true); setDataErr(''); }
    fetch(`/api/live-tracking/${activeId}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setDataErr(d.error || 'Failed to load sheet data'); setLoadingData(false); return; }
      setData(d);
      setDataErr('');
      setUpdatedAt(new Date());
      setLoadingData(false);
    }).catch(() => { setDataErr('Failed to load sheet data'); setLoadingData(false); });
  }, [activeId]);

  useEffect(() => {
    setData(null); setDataErr(''); setQ('');
    if (!activeId) return;
    loadData(false);
    const t = setInterval(() => loadData(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [activeId, loadData]);

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    const t = q.trim().toLowerCase();
    if (!t) return data.rows;
    return data.rows.filter((row) => row.some((c) => String(c ?? '').toLowerCase().includes(t)));
  }, [data, q]);

  function openAdd() { setForm(blankForm()); setFormErr(''); setModal('add'); }
  function openEdit() {
    const s = list.find((s) => s.id === activeId);
    if (!s) return;
    setForm({
      name: s.name || '',
      sheetLink: s.sheet_id || '',
      sheetName: s.sheet_name || '',
      headerRow: s.header_row || 1,
    });
    setFormErr('');
    setModal('edit');
  }
  function closeModal() { if (!saving) setModal(null); }

  async function save() {
    setFormErr('');
    if (!form.name.trim())       { setFormErr('Name is required'); return; }
    if (!form.sheetLink.trim())  { setFormErr('Google Sheet link is required'); return; }
    if (!form.sheetName.trim())  { setFormErr('Sheet tab name is required'); return; }
    setSaving(true);
    try {
      const url    = modal === 'edit' ? `/api/live-tracking/${activeId}` : '/api/live-tracking';
      const method = modal === 'edit' ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setFormErr(d.error || 'Failed to save'); return; }
      setModal(null);
      await loadList();
      if (modal === 'add' && d.id) setActiveId(d.id);
      else loadData(false);
    } finally { setSaving(false); }
  }

  function removeActive() {
    const s = list.find((s) => s.id === activeId);
    if (!s) return;
    ask(`Remove "${s.name}"? (The Google Sheet itself is untouched.)`, async () => {
      await fetch(`/api/live-tracking/${activeId}`, { method: 'DELETE' });
      loadList();
    });
  }

  const activeTracker = list.find((s) => s.id === activeId);
  const sheetUrl = activeTracker ? `https://docs.google.com/spreadsheets/d/${activeTracker.sheet_id}` : null;

  return (
    <div className="space-y-4 animate-fade-in">

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <LiveIcon className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[15px] font-semibold tracking-tight text-slate-900">Live Tracking</h1>
            <p className="text-[11.5px] text-slate-500">{list.length} sheet{list.length !== 1 ? 's' : ''} connected · mirrors Google Sheets live</p>
          </div>
        </div>
        {isAdmin && (
          <button className="btn-primary !text-[12px] sm:ml-auto flex items-center gap-1.5" onClick={openAdd}>
            <PlusIcon /> Connect Sheet
          </button>
        )}
      </div>

      {loadingList ? (
        <div className="card p-10 text-center text-slate-400 text-[13px]">Loading…</div>
      ) : list.length === 0 ? (
        <div className="card p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3"><LiveIcon className="text-primary-500 w-6 h-6" /></div>
          <div className="text-[13.5px] font-semibold text-slate-700">No live sheets connected {isAdmin ? 'yet' : ''}</div>
          <div className="text-[12px] text-slate-500 mt-0.5">
            {isAdmin ? 'Click "Connect Sheet" — paste the Google Sheet link and its tab name, and its data shows up here live.' : 'Ask an admin to connect a Google Sheet here.'}
          </div>
        </div>
      ) : (
        <>
          {/* Tab bar — one per connected sheet */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {list.map((s) => {
              const active = s.id === activeId;
              return (
                <button key={s.id} onClick={() => setActiveId(s.id)}
                  className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
                    active ? 'bg-primary-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {s.name || s.sheet_name}
                </button>
              );
            })}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <input className="input max-w-xs" placeholder="🔍 Search this sheet…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="text-[11px] text-slate-400">
              {data ? `${filteredRows.length} of ${data.rows.length} row${data.rows.length !== 1 ? 's' : ''}` : ''}
              {updatedAt && ` · updated ${updatedAt.toLocaleTimeString()}`}
            </span>
            <div className="flex items-center gap-1.5 sm:ml-auto flex-wrap">
              {sheetUrl && (
                <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary !text-[12px]">🔗 Open in Sheets ↗</a>
              )}
              <button className="btn-secondary !text-[12px]" onClick={() => loadData(false)} disabled={loadingData}>
                {loadingData ? 'Refreshing…' : '⟳ Refresh'}
              </button>
              {isAdmin && (
                <>
                  <button className="btn-secondary !text-[12px]" onClick={openEdit}>✏️ Edit</button>
                  <button className="btn-danger !text-[12px]" onClick={removeActive}>🗑 Remove</button>
                </>
              )}
            </div>
          </div>

          {/* Live data */}
          <div className="card overflow-hidden">
            {dataErr ? (
              <div className="p-10 text-center">
                <div className="text-[13.5px] font-semibold text-red-600">{dataErr}</div>
                <div className="text-[12px] text-slate-500 mt-1">Check the sheet link, tab name, and that it's shared with the service account.</div>
              </div>
            ) : loadingData && !data ? (
              <div className="p-10 text-center text-slate-400 text-[13px]">Loading live data…</div>
            ) : !data || data.rows.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-[13px]">No data rows found in this tab.</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-[13px]">No rows match "{q}".</div>
            ) : (
              <div className="overflow-auto max-h-[70vh]">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {data.headers.map((h, i) => <th key={i} className="table-th whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, ri) => (
                      <tr key={ri} className="table-row">
                        {row.map((c, ci) => {
                          const val = String(c ?? '').trim();
                          return (
                            <td key={ci} className="table-td whitespace-nowrap">
                              {isLinkValue(val)
                                ? <a href={val} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">Click here ↗</a>
                                : (val || '—')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {ConfirmUI}

      {modal && (
        <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-slate-100 rounded-t-2xl flex items-center gap-2.5 bg-primary-50">
              <div className="w-9 h-9 rounded-lg shrink-0 grid place-items-center text-white shadow-sm bg-gradient-to-br from-primary-400 to-primary-700">
                <LiveIcon className="w-[17px] h-[17px]" stroke="#fff" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-primary-800">{modal === 'edit' ? 'Edit Connection' : 'Connect a Google Sheet'}</div>
                <div className="text-[11px] mt-0.5 text-primary-600">{modal === 'edit' ? 'Update the link, tab, or name' : 'Paste the sheet link + tab name to mirror it here'}</div>
              </div>
              <button onClick={closeModal} className="btn-ghost w-8 h-8 !p-0 shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {formErr && <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12.5px] px-3 py-2">{formErr}</div>}
              <div>
                <label className="label">Name <span className="text-slate-400 font-normal normal-case">(shown as the tab label)</span></label>
                <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. FMS Live Tracker" />
              </div>
              <div>
                <label className="label">Google Sheet Link</label>
                <input className="input" value={form.sheetLink} onChange={(e) => setForm((f) => ({ ...f, sheetLink: e.target.value }))} placeholder="Paste the full Google Sheet URL (or just the ID)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Sheet Tab Name</label>
                  <input className="input" value={form.sheetName} onChange={(e) => setForm((f) => ({ ...f, sheetName: e.target.value }))} placeholder="e.g. Sheet1" />
                </div>
                <div>
                  <label className="label">Header Row</label>
                  <input type="number" min="1" className="input" value={form.headerRow} onChange={(e) => setForm((f) => ({ ...f, headerRow: Number(e.target.value) || 1 }))} />
                </div>
              </div>
              <div className="text-[11px] text-slate-400">
                Make sure the sheet is shared (Viewer is enough) with the app's Google service account.
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2 rounded-b-2xl bg-slate-50/60">
              <button className="btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : (modal === 'edit' ? 'Save' : 'Connect')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlusIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function LiveIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 18a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M8.5 14.5a5 5 0 0 1 7 0"/><path d="M5 11a9 9 0 0 1 14 0"/></svg>; }

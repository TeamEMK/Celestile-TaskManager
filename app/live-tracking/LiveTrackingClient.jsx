'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useConfirmToast } from '../components/ConfirmToast';
import { Gallery } from '../components/ImageLightbox';
import {
  buildPriorityStats, detectColumns, extractLinks, imageCandidates, linkKind,
  priorityOf, branchOf, isRowDone, rowTone, textWithoutLinks,
  PRIORITY_PILL, PRIORITY_ROW, DONE_ROW,
} from '@/lib/liveTrackingView';

const blankForm = () => ({ name: '', sheetLink: '', sheetName: '', headerRow: 1 });
const REFRESH_MS = 30000;
const DEFAULT_COL_WIDTH = 160;
const MIN_COL_WIDTH = 60;

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
  // Clicking a cell in the priority summary narrows the table to that
  // branch/priority combination. null = no narrowing.
  const [statFilter, setStatFilter] = useState(null); // { branch, priority }

  const [modal, setModal] = useState(null); // 'add' | 'edit' | null
  const [form, setForm]   = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // Per-tracker column widths — drag the header edge to resize, persisted
  // per tracker in this browser so it's remembered across visits/reloads.
  const [colWidths, setColWidths] = useState({});
  const resizeRef = useRef(null);

  useEffect(() => {
    if (!activeId) { setColWidths({}); return; }
    try { setColWidths(JSON.parse(localStorage.getItem(`lt-col-widths-${activeId}`) || '{}')); }
    catch { setColWidths({}); }
  }, [activeId]);

  const startColResize = useCallback((e, index) => {
    e.preventDefault();
    resizeRef.current = { index, startX: e.clientX, startWidth: colWidths[index] || DEFAULT_COL_WIDTH };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onColResizeMove);
    window.addEventListener('mouseup', onColResizeEnd);
  }, [colWidths]);

  function onColResizeMove(e) {
    const r = resizeRef.current;
    if (!r) return;
    const next = Math.max(MIN_COL_WIDTH, r.startWidth + (e.clientX - r.startX));
    setColWidths((w) => ({ ...w, [r.index]: next }));
  }
  function onColResizeEnd() {
    window.removeEventListener('mousemove', onColResizeMove);
    window.removeEventListener('mouseup', onColResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    resizeRef.current = null;
    setColWidths((w) => {
      try { localStorage.setItem(`lt-col-widths-${activeId}`, JSON.stringify(w)); } catch {}
      return w;
    });
  }

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
    setData(null); setDataErr(''); setQ(''); setStatFilter(null);
    if (!activeId) return;
    loadData(false);
    const t = setInterval(() => loadData(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [activeId, loadData]);

  // Which columns carry the priority, the branch and the "actual complete"
  // date. Sheets are connected as-is with no per-column config, so these are
  // sniffed from the headers (see lib/liveTrackingView.js).
  const cols = useMemo(
    () => detectColumns(data?.headers || [], data?.rows || []),
    [data],
  );

  const stats = useMemo(() => buildPriorityStats(data?.rows || [], cols), [data, cols]);

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    let rows = data.rows;
    const t = q.trim().toLowerCase();
    if (t) rows = rows.filter((row) => row.some((c) => String(c ?? '').toLowerCase().includes(t)));
    if (statFilter) {
      rows = rows.filter((row) => {
        if (statFilter.priority && priorityOf(row[cols.priorityIdx]) !== statFilter.priority) return false;
        if (statFilter.branch) {
          const b = cols.branchIdx >= 0 ? (branchOf(row[cols.branchIdx]) || 'Other') : 'Other';
          if (b !== statFilter.branch) return false;
        }
        return true;
      });
    }
    return rows;
  }, [data, q, statFilter, cols]);

  // A stat cell toggles: clicking the one already applied clears it.
  const toggleStatFilter = useCallback((branch, priority) => {
    setStatFilter((cur) =>
      cur && cur.branch === branch && cur.priority === priority ? null : { branch, priority });
  }, []);

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
            {statFilter && (
              <button onClick={() => setStatFilter(null)}
                className="pill bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100">
                {statFilter.branch} · {statFilter.priority} ✕
              </button>
            )}
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

          {/* Priority stats — branch-wise (Bangalore / Hyderabad), only shown
              when the connected sheet actually has a priority column. */}
          {stats && (
            <PriorityStats stats={stats} filter={statFilter} onPick={toggleStatFilter} />
          )}

          {/* Row-colour legend, so the tints on the table below are readable
              without guessing what green vs amber means. */}
          {(stats || cols.doneIdx >= 0) && (
            <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
              {cols.doneIdx >= 0 && (
                <LegendDot color={DONE_ROW.accent} bg={DONE_ROW.bg}
                  label={`Completed (${data?.headers?.[cols.doneIdx] || 'actual date'} filled)`} />
              )}
              {stats && ['High', 'Medium', 'Low'].map((p) => (
                <LegendDot key={p} color={PRIORITY_ROW[p].accent} bg={PRIORITY_ROW[p].bg} label={`${p} priority`} />
              ))}
            </div>
          )}

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
              <div className="p-10 text-center text-slate-400 text-[13px]">
                No rows match {q ? `"${q}"` : ''}{q && statFilter ? ' + ' : ''}
                {statFilter ? `${statFilter.branch} · ${statFilter.priority}` : ''}.
              </div>
            ) : (
              <div className="overflow-auto max-h-[70vh]">
                <table className="text-[12.5px]" style={{ tableLayout: 'fixed', width: data.headers.reduce((sum, _, i) => sum + (colWidths[i] || DEFAULT_COL_WIDTH), 0) }}>
                  <colgroup>
                    {data.headers.map((_, i) => <col key={i} style={{ width: colWidths[i] || DEFAULT_COL_WIDTH }} />)}
                  </colgroup>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {data.headers.map((h, i) => (
                        <th key={i} className="table-th whitespace-nowrap" style={{ position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {h}
                          <span
                            onMouseDown={(e) => startColResize(e, i)}
                            className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-primary-300/70 active:bg-primary-400"
                            title="Drag to resize column"
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, ri) => {
                      const tone = rowTone(row, cols);
                      const done = isRowDone(row, cols.doneIdx);
                      return (
                        <tr key={ri} className="table-row"
                          style={tone ? { background: tone.bg, color: tone.text } : undefined}
                          title={done ? 'Completed — actual date is filled' : undefined}>
                          {row.map((c, ci) => {
                            const val = String(c ?? '').trim();
                            const isPriorityCell = ci === cols.priorityIdx;
                            const pill = isPriorityCell ? PRIORITY_PILL[priorityOf(val)] : null;
                            return (
                              <td key={ci} className="table-td whitespace-nowrap"
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  ...(tone ? { color: tone.text } : null),
                                  // Accent stripe down the left edge of the row —
                                  // inset shadow rather than a border so the fixed
                                  // column widths don't shift.
                                  ...(ci === 0 && tone ? { boxShadow: `inset 4px 0 0 ${tone.accent}` } : null),
                                }}>
                                {pill
                                  ? <span className={`pill !text-[11px] !py-0.5 ${pill}`}>{val}</span>
                                  : <CellValue value={c} />}
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

/* ── one table cell ───────────────────────────────────────────────────
   Sheet cells are plain text, so an attachment arrives as a bare URL (or,
   for a Form's multi-file upload question, several comma-separated URLs in
   one cell). Print "Click here" instead of the URL, and open the images in
   the viewer rather than dumping the user into Drive. */
function CellValue({ value }) {
  const [galleryAt, setGalleryAt] = useState(null);
  const val = String(value ?? '').trim();
  const links = useMemo(() => extractLinks(val), [val]);
  const images = useMemo(
    () => links.filter((l) => linkKind(l) === 'image')
      .map((l) => ({ href: l, candidates: imageCandidates(l) })),
    [links],
  );
  const files = useMemo(() => links.filter((l) => linkKind(l) !== 'image'), [links]);
  const rest = useMemo(() => textWithoutLinks(val), [val]);

  if (!val) return <>—</>;
  if (!links.length) return <>{val}</>;

  return (
    <span className="inline-flex items-center gap-2 align-middle">
      {rest && <span>{rest}</span>}
      {images.length > 0 && (
        <button type="button" onClick={() => setGalleryAt(0)}
          title={images.length > 1 ? `${images.length} images — click to view` : 'Click to view'}
          className="text-primary-600 hover:text-primary-700 hover:underline font-medium">
          📷 Click here{images.length > 1 ? ` (${images.length})` : ''}
        </button>
      )}
      {files.map((f, i) => (
        <a key={f} href={f} target="_blank" rel="noopener noreferrer" title={f}
          className="text-primary-600 hover:text-primary-700 hover:underline font-medium">
          📄 Click here{files.length > 1 ? ` ${i + 1}` : ''} ↗
        </a>
      ))}
      {galleryAt !== null && (
        <Gallery items={images} start={galleryAt} onClose={() => setGalleryAt(null)} />
      )}
    </span>
  );
}

/* ── priority × branch summary ────────────────────────────────────── */
function PriorityStats({ stats, filter, onPick }) {
  const { priorities, branches, at, rowTotal, colTotal, grand, hasDone, hasBranch } = stats;

  const Cell = ({ branch, priority, count, clickable = true }) => {
    const active = clickable && filter && filter.branch === branch && filter.priority === priority;
    const tint = PRIORITY_ROW[priority];
    return (
      <td className="table-td text-center !py-1.5">
        <button
          type="button"
          disabled={!clickable || count.total === 0}
          onClick={() => onPick(branch, priority)}
          className={`min-w-[54px] rounded-lg px-2 py-1 transition-colors ${
            count.total === 0 ? 'text-slate-300 cursor-default'
              : active ? 'ring-2 ring-primary-400' : 'hover:brightness-95 cursor-pointer'
          }`}
          style={count.total > 0 && tint ? { background: tint.bg, color: tint.text } : undefined}
        >
          <span className="block text-[15px] font-semibold leading-tight">{count.total}</span>
          {hasDone && count.total > 0 && (
            <span className="block text-[10px] opacity-70 leading-tight">{count.done} done</span>
          )}
        </button>
      </td>
    );
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-transparent flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-[13px] font-semibold text-slate-900">Priority Breakdown</h2>
          <p className="text-[11px] text-slate-500">
            {hasBranch ? 'Bangalore vs Hyderabad' : 'No branch column in this sheet — showing combined'}
            {' · click a number to filter the table'}
          </p>
        </div>
        <span className="pill bg-slate-100 text-slate-600">
          {grand.total} row{grand.total !== 1 ? 's' : ''}{hasDone ? ` · ${grand.done} completed` : ''}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr>
              <th className="table-th">Branch</th>
              {priorities.map((p) => <th key={p} className="table-th text-center">{p}</th>)}
              <th className="table-th text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b} className="table-row">
                <td className="table-td font-semibold text-slate-700 whitespace-nowrap">{b}</td>
                {priorities.map((p) => <Cell key={p} branch={b} priority={p} count={at(b, p)} />)}
                <td className="table-td text-center font-semibold text-slate-800">
                  {rowTotal(b).total}
                  {hasDone && rowTotal(b).total > 0 && (
                    <span className="block text-[10px] font-normal text-slate-400">{rowTotal(b).done} done</span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="table-row bg-slate-50/70">
              <td className="table-td font-semibold text-slate-700">All branches</td>
              {priorities.map((p) => (
                <td key={p} className="table-td text-center font-semibold text-slate-800">
                  {colTotal(p).total}
                  {hasDone && colTotal(p).total > 0 && (
                    <span className="block text-[10px] font-normal text-slate-400">{colTotal(p).done} done</span>
                  )}
                </td>
              ))}
              <td className="table-td text-center font-bold text-slate-900">{grand.total}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LegendDot({ color, bg, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded" style={{ background: bg, boxShadow: `inset 3px 0 0 ${color}` }} />
      {label}
    </span>
  );
}

function PlusIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function LiveIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 18a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M8.5 14.5a5 5 0 0 1 7 0"/><path d="M5 11a9 9 0 0 1 14 0"/></svg>; }

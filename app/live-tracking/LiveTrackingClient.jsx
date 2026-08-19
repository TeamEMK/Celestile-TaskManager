'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useConfirmToast } from '../components/ConfirmToast';
import { Gallery } from '../components/ImageLightbox';
import Icon from '../components/Icon';
import {
  PageHeader, MetaLine, LiveDot, EmptyState, ErrorState, LoadingState,
  SearchInput, ActiveFilters, ResultCount, SectionTitle, GroupRule,
} from '../components/ui';
import {
  buildPriorityStats, cellAttachments, detectColumns,
  priorityOf, branchOf, isRowDone, rowTone,
  parseSheetDate, formatSheetDate, dateToInput,
  EMPTY_FILTERS, activeFilterCount, rowMatchesFilters,
  BRANCHES, PRIORITIES, PRIORITY_PILL, PRIORITY_ROW, DONE_ROW,
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

  // Every way of narrowing the table lives in one object — the search box, the
  // branch/priority/status pickers, and the date range. Clicking a card in the
  // Priority Breakdown writes into the same place, so the toolbar always shows
  // what the table is actually doing.
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const setFilter = useCallback((patch) => setFilters((f) => ({ ...f, ...patch })), []);
  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

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
    setData(null); setDataErr(''); setFilters(EMPTY_FILTERS);
    if (!activeId) return;
    loadData(false);
    const t = setInterval(() => loadData(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [activeId, loadData]);

  // Which columns carry the priority, the branch, the "actual complete" date
  // and any other dates. Sheets are connected as-is with no per-column config,
  // so these are sniffed from the headers (see lib/liveTrackingView.js).
  const cols = useMemo(
    () => detectColumns(data?.headers || [], data?.rows || []),
    [data],
  );

  // Does this sheet have a priority column at all? Computed over every row, so
  // the breakdown block keeps its place when a filter empties it out.
  const baseStats = useMemo(() => buildPriorityStats(data?.rows || [], cols), [data, cols]);

  // The cards themselves are what set branch/priority, so folding those two
  // back in would collapse the grid to the single card just clicked. Every
  // other filter does narrow the breakdown — a date range that doesn't move
  // the numbers above it is the thing that makes a dashboard untrustworthy.
  const statRows = useMemo(() => {
    if (!data?.rows) return [];
    const order = cols.dateOrderByIdx?.[filters.dateIdx] || 'dmy';
    const scoped = { ...filters, branch: '', priority: '' };
    return data.rows.filter((row) => rowMatchesFilters(row, cols, scoped, order));
  }, [data, filters, cols]);

  const stats = useMemo(() => buildPriorityStats(statRows, cols), [statRows, cols]);

  // Only the values the sheet actually uses get an option — an empty
  // "Medium" in a High/Regular tracker is just a dead end for the user.
  const branchOptions = useMemo(() => {
    if (cols.branchIdx < 0 || !data?.rows) return [];
    const seen = new Set(data.rows.map((r) => branchOf(r[cols.branchIdx]) || 'Other'));
    return [...BRANCHES.filter((b) => seen.has(b)), ...(seen.has('Other') ? ['Other'] : [])];
  }, [data, cols]);

  const priorityOptions = useMemo(() => {
    if (cols.priorityIdx < 0 || !data?.rows) return [];
    const seen = new Set(data.rows.map((r) => priorityOf(r[cols.priorityIdx])).filter(Boolean));
    return [
      ...PRIORITIES.filter((p) => seen.has(p)),
      ...[...seen].filter((p) => !PRIORITIES.includes(p)).sort(),
    ];
  }, [data, cols]);

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    const order = cols.dateOrderByIdx?.[filters.dateIdx] || 'dmy';
    return data.rows.filter((row) => rowMatchesFilters(row, cols, filters, order));
  }, [data, filters, cols]);

  const nActive = activeFilterCount(filters);

  // A stat card toggles: clicking the one already applied clears it.
  const toggleStatCard = useCallback((branch, priority) => {
    setFilters((f) => (f.branch === branch && f.priority === priority
      ? { ...f, branch: '', priority: '' }
      : { ...f, branch, priority }));
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

      {/* Identity on the left, everything you can *do* to this tracker on the
          right — so the toolbar below stays purely about filtering. */}
      <PageHeader
        icon="live"
        title="Live Tracking"
        subtitle={<MetaLine items={[
          `${list.length} sheet${list.length !== 1 ? 's' : ''} connected`,
          <LiveDot key="live" label="live from Google Sheets" />,
          updatedAt && `updated ${updatedAt.toLocaleTimeString()}`,
        ]} />}
      >
        {activeId && sheetUrl && (
          <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
            <Icon name="sheet" className="w-3.5 h-3.5" /> Open in Sheets
          </a>
        )}
        {activeId && (
          <button className="btn-secondary btn-sm" onClick={() => loadData(false)} disabled={loadingData}>
            <Icon name="refresh" className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} /> {loadingData ? 'Refreshing' : 'Refresh'}
          </button>
        )}
        {isAdmin && activeId && (
          <>
            <button className="btn-secondary btn-sm" onClick={openEdit}><Icon name="edit" className="w-3.5 h-3.5" /> Edit</button>
            <button className="btn-secondary btn-sm !text-red-600 hover:!bg-red-50 hover:!border-red-200" onClick={removeActive}>
              <Icon name="trash" className="w-3.5 h-3.5" /> Remove
            </button>
          </>
        )}
        {isAdmin && (
          <button className="btn-primary btn-sm" onClick={openAdd}>
            <Icon name="plus" className="w-4 h-4" /> Connect Sheet
          </button>
        )}
      </PageHeader>

      {loadingList ? (
        <div className="card"><LoadingState /></div>
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="live" tone="gold"
            title={`No live sheets connected${isAdmin ? ' yet' : ''}`}
            hint={isAdmin
              ? 'Paste a Google Sheet link and its tab name and its data shows up here live.'
              : 'Ask an admin to connect a Google Sheet here.'}
            action={isAdmin ? <button className="btn-primary btn-sm" onClick={openAdd}><Icon name="plus" className="w-3.5 h-3.5" /> Connect Sheet</button> : null}
          />
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

          {/* Priority stats — branch-wise (Bangalore / Hyderabad), only shown
              when the connected sheet actually has a priority column. */}
          {stats ? (
            <PriorityStats
              stats={stats} filters={filters} onPick={toggleStatCard}
              narrowed={statRows.length !== (data?.rows.length ?? 0)}
              allRows={data?.rows.length ?? 0}
            />
          ) : baseStats ? (
            <div className="card p-4 text-center text-[12px] text-slate-500">
              No rows match the current search / status / date filters, so there is nothing to break down yet.
            </div>
          ) : null}

          {/* Filters */}
          {data && (
            <FilterBar
              filters={filters} setFilter={setFilter} onClear={clearFilters}
              nActive={nActive}
              branchOptions={branchOptions} priorityOptions={priorityOptions}
              dateCols={cols.dateCols || []} hasDone={cols.doneIdx >= 0}
              doneHeader={data.headers?.[cols.doneIdx]}
              shown={filteredRows.length} total={data.rows.length}
            />
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

          {/* AppSheet upload columns hold a filename, not a link. If the app
              can't reach the Drive folder holding those files, say so once
              here rather than leaving every "Click here" quietly degraded. */}
          {data?.fileLinkError ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11.5px] px-3 py-2">
              <b>Uploaded files aren&apos;t linked yet.</b> {data.fileLinkError} Share that Drive folder
              (Viewer is enough) with the app&apos;s Google service account and the uploads will open
              in one click. Until then, &quot;Click here&quot; opens a Drive search for the file name.
            </div>
          ) : data?.fileStats && data.fileStats.resolved < data.fileStats.total ? (
            // The folder was read fine — these uploads were deleted from Drive
            // after the sheet recorded their name. Worth stating once, so the
            // "Not in Drive" rows don't read as an app bug.
            <div className="text-[11px] text-slate-400">
              {data.fileStats.resolved} of {data.fileStats.total} uploads open directly ·{' '}
              {data.fileStats.total - data.fileStats.resolved} no longer exist in the Drive folder
            </div>
          ) : null}

          {/* Live data */}
          <div className="card overflow-hidden">
            {dataErr ? (
              <ErrorState title={dataErr}
                hint="Check the sheet link, the tab name, and that the sheet is shared with the app's service account." />
            ) : loadingData && !data ? (
              <LoadingState label="Loading live data…" />
            ) : !data || data.rows.length === 0 ? (
              <EmptyState icon="sheet" title="No data rows in this tab"
                hint="The tab is reachable but empty below the header row." />
            ) : filteredRows.length === 0 ? (
              <EmptyState
                icon="filter"
                title="No rows match these filters"
                hint={`All ${data.rows.length.toLocaleString()} rows are still here — widen or clear the filters to see them.`}
                action={<button className="btn-secondary btn-sm" onClick={clearFilters}>Clear all filters</button>}
              />
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
                            const dateOrder = cols.dateOrderByIdx?.[ci];
                            return (
                              <td key={ci} className="table-td align-top"
                                style={{
                                  // Cells wrap instead of being cut off with an
                                  // ellipsis — order/client names and uploaded
                                  // filenames are routinely wider than a column.
                                  whiteSpace: 'normal',
                                  overflowWrap: 'anywhere',
                                  ...(tone ? { color: tone.text } : null),
                                  // Accent stripe down the left edge of the row —
                                  // inset shadow rather than a border so the fixed
                                  // column widths don't shift.
                                  ...(ci === 0 && tone ? { boxShadow: `inset 4px 0 0 ${tone.accent}` } : null),
                                }}>
                                {pill
                                  ? <span className={`pill !text-[11px] !py-0.5 ${pill}`}>{val}</span>
                                  : dateOrder
                                    ? <DateCell value={c} order={dateOrder} />
                                    : <CellValue value={c} fileLinks={data.fileLinks} indexed={data.fileStats?.indexed} />}
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
                <Icon name="live" className="w-[17px] h-[17px]" />
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
                Make sure the sheet is shared (Viewer is enough) with the app&apos;s Google service account.
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

/* ── filter toolbar ───────────────────────────────────────────────────
   Everything that narrows the table, in one strip: free-text search, the
   dimensions the sheet actually has (branch / priority / completion), and a
   date range on any date column. Options are built from the live data, so a
   tracker without a branch column simply doesn't show a branch picker. */

// Shared control chrome. Native select/date rendering is kept on purpose —
// a hand-rolled chevron costs an inline data-URI in a class name and breaks
// the OS date picker, and neither buys anything over the native control.
const CTRL_CLS = 'h-9 bg-white border border-slate-200 rounded-lg text-[12.5px] text-slate-700 ' +
  'focus:outline-none focus:border-primary-400 hover:border-slate-300 transition';
const SELECT_CLS = `${CTRL_CLS} pl-2.5 pr-7 cursor-pointer`;
const DATE_CLS   = `${CTRL_CLS} px-2.5`;

// Ranges people actually ask for in a review meeting. Each returns
// [from, to] as Date objects; the bar converts them for <input type="date">.
const DATE_PRESETS = [
  { key: 'today', label: 'Today', range: () => { const d = new Date(); return [startOfDay(d), startOfDay(d)]; } },
  { key: '7d',    label: 'Last 7 days',  range: () => [daysAgo(6), startOfDay(new Date())] },
  { key: '30d',   label: 'Last 30 days', range: () => [daysAgo(29), startOfDay(new Date())] },
  { key: 'month', label: 'This month',   range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), startOfDay(n)]; } },
  { key: 'year',  label: 'This year',    range: () => { const n = new Date(); return [new Date(n.getFullYear(), 0, 1), startOfDay(n)]; } },
];

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return startOfDay(d); }

function FilterBar({
  filters, setFilter, onClear, nActive,
  branchOptions, priorityOptions, dateCols, hasDone, doneHeader, shown, total,
}) {
  // Picking a preset before choosing a column would silently do nothing, so
  // the first date column is assumed until the user says otherwise.
  const dateIdx = filters.dateIdx >= 0 ? filters.dateIdx : (dateCols[0]?.idx ?? -1);
  const applyPreset = (preset) => {
    if (dateIdx < 0) return;
    const [from, to] = preset.range();
    setFilter({ dateIdx, from: dateToInput(from), to: dateToInput(to) });
  };
  const activePreset = DATE_PRESETS.find((p) => {
    if (!filters.from || !filters.to) return false;
    const [f, t] = p.range();
    return dateToInput(f) === filters.from && dateToInput(t) === filters.to;
  });

  const chips = [];
  if (filters.q.trim()) chips.push({ k: 'q', label: `“${filters.q.trim()}”`, clear: { q: '' } });
  if (filters.branch)   chips.push({ k: 'b', label: filters.branch, clear: { branch: '' } });
  if (filters.priority) chips.push({ k: 'p', label: `${filters.priority} priority`, clear: { priority: '' } });
  if (filters.status)   chips.push({ k: 's', label: filters.status === 'done' ? 'Completed' : 'Pending', clear: { status: '' } });
  if (filters.dateIdx >= 0 && (filters.from || filters.to)) {
    const col = dateCols.find((d) => d.idx === filters.dateIdx);
    const range = activePreset ? activePreset.label
      : [filters.from && fmtInput(filters.from), filters.to && fmtInput(filters.to)].filter(Boolean).join(' → ');
    chips.push({ k: 'd', label: `${col?.header || 'Date'}: ${range}`, clear: { from: '', to: '' } });
  }

  return (
    <div className="card p-3 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput value={filters.q} onChange={(q) => setFilter({ q })}
          placeholder="Search anything in this sheet…" />

        {branchOptions.length > 0 && (
          <select className={SELECT_CLS} value={filters.branch} onChange={(e) => setFilter({ branch: e.target.value })} title="Branch">
            <option value="">All branches</option>
            {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}

        {priorityOptions.length > 0 && (
          <select className={SELECT_CLS} value={filters.priority} onChange={(e) => setFilter({ priority: e.target.value })} title="Priority">
            <option value="">All priorities</option>
            {priorityOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        {hasDone && (
          <select className={SELECT_CLS} value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}
            title={doneHeader ? `Based on "${doneHeader}"` : 'Completion status'}>
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="done">Completed</option>
          </select>
        )}

        {/* Count sits at the end of the controls, where the eye lands after
            changing one — not buried under the table. */}
        <div className="ml-auto">
          <ResultCount shown={nActive > 0 ? shown : total} total={total} />
        </div>
      </div>

      {/* Date range — its own line, since it is three controls plus presets */}
      {dateCols.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
            <Icon name="calendar" className="w-3.5 h-3.5" /> Date
          </span>

          {dateCols.length > 1 ? (
            <select className={SELECT_CLS} value={dateIdx}
              onChange={(e) => setFilter({ dateIdx: Number(e.target.value) })} title="Which date column to filter on">
              {dateCols.map((d) => <option key={d.idx} value={d.idx}>{d.header}</option>)}
            </select>
          ) : (
            <span className="text-[12px] text-slate-600 font-medium">{dateCols[0].header}</span>
          )}

          <input type="date" className={DATE_CLS} value={filters.from}
            onChange={(e) => setFilter({ dateIdx, from: e.target.value })} title="From" />
          <span className="text-slate-400 text-[12px]">→</span>
          <input type="date" className={DATE_CLS} value={filters.to}
            onChange={(e) => setFilter({ dateIdx, to: e.target.value })} title="To" />

          <div className="flex items-center gap-1 flex-wrap">
            {DATE_PRESETS.map((p) => (
              <button key={p.key} onClick={() => applyPreset(p)}
                className={`px-2.5 h-7 rounded-md text-[11.5px] font-medium transition ${
                  activePreset?.key === p.key
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {(filters.from || filters.to) && (
            <button onClick={() => setFilter({ from: '', to: '' })}
              className="text-[11.5px] text-slate-500 hover:text-slate-800 underline underline-offset-2">reset dates</button>
          )}
        </div>
      )}

      {/* What is currently applied, each removable on its own */}
      <ActiveFilters onClearAll={onClear}
        chips={chips.map((c) => ({ key: c.k, label: c.label, onRemove: () => setFilter(c.clear) }))} />
    </div>
  );
}

// yyyy-mm-dd → dd-mm-yyyy, for the chip label.
function fmtInput(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

/* ── one table cell ───────────────────────────────────────────────────
   Sheet cells are plain text, so an attachment arrives as a bare URL (or,
   for a Form's multi-file upload question, several comma-separated URLs in
   one cell). Print "Click here" instead of the URL, and open the images in
   the viewer rather than dumping the user into Drive. */
function CellValue({ value, fileLinks, indexed }) {
  const [galleryAt, setGalleryAt] = useState(null);
  const val = String(value ?? '').trim();
  const att = useMemo(() => cellAttachments(val, fileLinks, indexed), [val, fileLinks, indexed]);
  const { text, images, files } = att;

  if (!val) return <>—</>;
  if (!images.length && !files.length) return <>{val}</>;

  return (
    <span className="inline-flex items-center gap-2 align-middle flex-wrap">
      {text && <span>{text}</span>}
      {images.length > 0 && (
        <button type="button" onClick={() => setGalleryAt(0)}
          title={images.length > 1 ? `${images.length} files — click to view` : (images[0].name || 'Click to view')}
          className="text-primary-600 hover:text-primary-700 hover:underline font-medium">
          <Icon name="image" className="w-3.5 h-3.5" /> Click here{images.length > 1 ? ` (${images.length})` : ''}
        </button>
      )}
      {files.map((f, i) => (
        <a key={f.href} href={f.href} target="_blank" rel="noopener noreferrer"
          title={
            f.missing      ? `${f.name}\n\nThis upload is no longer in the app's Drive folder — it looks to have been deleted. Opening a Drive search for the name.`
            : f.unresolved ? `${f.name}\n\nThe Drive upload folder isn't reachable, so this couldn't be linked directly. Opening a Drive search for the name.`
            : f.name}
          className={`hover:underline font-medium ${f.unresolved ? 'text-slate-400 hover:text-slate-600' : 'text-primary-600 hover:text-primary-700'}`}>
          <Icon name={f.missing ? 'alert' : f.unresolved ? 'search' : 'file'} className="w-3.5 h-3.5" />
          {' '}{f.missing ? 'Not in Drive' : `Click here${files.length > 1 ? ` ${i + 1}` : ''}`}
        </a>
      ))}
      {galleryAt !== null && (
        <Gallery items={images} start={galleryAt} onClose={() => setGalleryAt(null)} />
      )}
    </span>
  );
}

// The sheet API hands dates back as serial numbers (see parseSheetDate), so
// without this a Date column reads "46107". Anything that doesn't parse is
// printed as-is rather than blanked — a stray note in a date column is still
// information.
function DateCell({ value, order }) {
  const d = parseSheetDate(value, order);
  if (!d) {
    const s = String(value ?? '').trim();
    return <>{s || '—'}</>;
  }
  return <span className="tabular-nums whitespace-nowrap">{formatSheetDate(d)}</span>;
}

/* ── priority × branch summary ────────────────────────────────────── */

// Same gradient language as the dashboard's KPI cards (DashboardClient's
// KPI_GRADIENTS), so the two pages read as one product.
const STAT_GRADIENTS = {
  High:   { grad: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)', shadow: 'rgba(249,115,22,0.35)' },
  Medium: { grad: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', shadow: 'rgba(245,158,11,0.35)' },
  Low:    { grad: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)', shadow: 'rgba(56,189,248,0.35)' },
  Total:  { grad: 'linear-gradient(135deg, #D9A81F 0%, #8F6B10 100%)', shadow: 'rgba(238,188,46,0.38)' },
};

// Sheets invent their own priority labels ("Regular" is the common one here).
// Colour them from a fixed list by position so a label keeps the same colour
// across refreshes instead of shifting as counts change.
const EXTRA_GRADIENTS = [
  { grad: 'linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)', shadow: 'rgba(45,212,191,0.35)' },
  { grad: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', shadow: 'rgba(167,139,250,0.35)' },
  { grad: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)', shadow: 'rgba(244,63,94,0.35)'  },
  { grad: 'linear-gradient(135deg, #94a3b8 0%, #475569 100%)', shadow: 'rgba(148,163,184,0.35)' },
];

function gradientFor(priority, priorities) {
  if (STAT_GRADIENTS[priority]) return STAT_GRADIENTS[priority];
  const extras = priorities.filter((p) => !STAT_GRADIENTS[p]);
  return EXTRA_GRADIENTS[Math.max(0, extras.indexOf(priority)) % EXTRA_GRADIENTS.length];
}

function StatCard({ label, count, gradient: g, hasDone, active, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  const pending = count.total - count.done;
  const pct = count.total ? Math.round((count.done / count.total) * 100) : 0;
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={onClick ? `Show only ${label} rows` : undefined}
      className={`rounded-lg p-2.5 relative overflow-hidden text-left w-[150px] shrink-0 transition ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'}`}
      style={{
        background: g.grad,
        opacity: count.total === 0 ? 0.45 : 1,
        boxShadow: active
          ? `0 0 0 2px #fff, 0 0 0 4px ${g.shadow.replace(/[\d.]+\)$/, '0.9)')}, 0 2px 10px ${g.shadow}`
          : `0 1px 8px ${g.shadow}`,
      }}
    >
      <div className="absolute -top-3 -right-3 w-12 h-12 rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }} />
      <div className="relative z-10">
        <div className="text-[9px] font-semibold uppercase tracking-wider truncate" style={{ color: 'rgba(255,255,255,0.75)' }}>{label}</div>
        <div className="text-[22px] leading-none font-black mt-0.5 tabular-nums text-white">{count.total}</div>
        {hasDone && (
          <>
            <div className="text-[9.5px] mt-1 font-medium truncate" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {count.total === 0 ? 'None' : `${count.done} done · ${pending} pending`}
            </div>
            {/* Progress rail — the done/pending numbers alone don't show at a
                glance which bucket is actually moving. */}
            {count.total > 0 && (
              <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.25)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'rgba(255,255,255,0.85)' }} />
              </div>
            )}
          </>
        )}
      </div>
    </Tag>
  );
}

function PriorityStats({ stats, filters, onPick, narrowed, allRows }) {
  const { priorities, branches, at, rowTotal, grand, hasDone, hasBranch } = stats;

  return (
    <div className="space-y-3">
      <SectionTitle
        note={hasBranch ? 'branch-wise · click a card to filter the table' : 'no branch column in this sheet'}
        right={
          <span className={`pill !text-[11px] ${narrowed
            ? 'bg-primary-50 text-primary-700 border border-primary-200'
            : 'bg-slate-100 text-slate-600'}`}>
            {grand.total}{narrowed ? ` of ${allRows}` : ''} row{grand.total !== 1 ? 's' : ''}
            {hasDone ? ` · ${grand.done} completed` : ''}
          </span>
        }
      >Priority Breakdown</SectionTitle>

      {branches.map((b) => (
        <div key={b} className="space-y-1">
          <GroupRule label={b} right={`${rowTotal(b).total} total`} />
          {/* Wrapping row of fixed-width cards. A grid with 1fr columns
              stretched three cards across the full page width, which is how a
              two-digit count ended up in a slab the size of a table. */}
          <div className="flex flex-wrap gap-2">
            {priorities.map((p) => (
              <StatCard
                key={p} label={p} count={at(b, p)} hasDone={hasDone}
                gradient={gradientFor(p, priorities)}
                active={filters.branch === b && filters.priority === p}
                onClick={at(b, p).total > 0 ? () => onPick(b, p) : undefined}
              />
            ))}
            <StatCard label={`${b} total`} count={rowTotal(b)} gradient={STAT_GRADIENTS.Total} hasDone={hasDone} />
          </div>
        </div>
      ))}
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


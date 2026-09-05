'use client';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AddMasterModal   from './components/AddMasterModal';
import AddDelegateModal from './components/AddDelegateModal';
import HolidaysModal    from './components/HolidaysModal';
import { useConfirmToast } from './components/ConfirmToast';
import { DonutChart, HorizBarChart } from './components/Charts';
import FmsDoneModal from './components/FmsDoneModal';
import { FMS_ENABLED } from '@/lib/config';
import { isImageAttachment } from '@/lib/attachmentType';
import { ZoomImg } from '@/app/components/ImageLightbox';
import CompletionFileModal from './components/CompletionFileModal';
import { useTaskCompletion } from './components/useTaskCompletion';
import { StatCard, StatGrid } from './components/ui';
import Icon from './components/Icon';
import DateField from './components/DateField';
import Avatar from './components/Avatar';

// FMS answers are raw sheet values, so an uploaded file or a pasted link
// would otherwise print as a wall of URL text in the details strip (the
// "Quotation pdf" field is the worst offender). Show a thumbnail for images
// and a short "Click here" for anything else that is openable.
function DetailValue({ value }) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (isImageAttachment(v)) {
    return <ZoomImg src={v} className="w-6 h-6 rounded object-cover border border-slate-200" />;
  }
  const isFile = v.includes('/api/drive/') || v.startsWith('data:application/pdf');
  if (isFile || /^https?:\/\//i.test(v)) {
    return (
      <a href={v} target="_blank" rel="noopener noreferrer" title={v}
        className="text-primary-600 hover:text-primary-700 hover:underline font-medium">
        Click here
      </a>
    );
  }
  return <>{value || '—'}</>;
}

export default function DashboardClient({ data, performance, pendingApprovals, holidays, users = [], isAdmin, userName = '' }) {
  const router = useRouter();

  const [masterOpen,   setMasterOpen]   = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [holidayOpen,  setHolidayOpen]  = useState(false);
  const [reviseTask,   setReviseTask]   = useState(null);
  const [reviseNote,   setReviseNote]   = useState('');
  const [reviseDate,   setReviseDate]   = useState('');
  const [reviseSaving, setReviseSaving] = useState(false);
  const [subTab,       setSubTab]       = useState('All');
  const [userFilter,   setUserFilter]   = useState('All');
  const [fmsNameFilter, setFmsNameFilter] = useState('All');
  const {
    fileTask, setFileTask, completionInput, setCompletionInput, fileUploading,
    submitCompletionFile, fmsDone, setFmsDone, fmsDoneLoading, openFmsDone,
  } = useTaskCompletion();
  const { ask, ConfirmUI } = useConfirmToast();

  // Computed only after mount (not during the SSR/initial-hydration render)
  // so the server-rendered HTML and the first client render match exactly.
  // Otherwise "now"-derived values (today's date, greeting) can differ
  // between the server and the browser's timezone, triggering React
  // hydration error #418 — which crashes the app and breaks navigation.
  const [todayISO, setTodayISO] = useState('');
  useEffect(() => {
    setTodayISO(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })); // en-CA => YYYY-MM-DD
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // Only refresh while the tab is actually visible — a backgrounded tab
    // was still re-running the full dashboard server query (readStore() +
    // FMS pending rows) every 60s for nothing.
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 60000);
    return () => clearInterval(t);
  }, [isAdmin, router]);

  const fmt = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' }).replace(/\//g, '-');
  };

  const visibleTasks = data.pendingTasks;
  const allDoers = useMemo(() => users.map((u) => u.name).sort(), [users]);
  const allFmsNames = useMemo(
    () => [...new Set(visibleTasks.filter((t) => t.type === 'FMS').map((t) => t.fmsName).filter(Boolean))].sort(),
    [visibleTasks]
  );

  // Memoized — this used to re-filter and re-sort (two Date allocations per
  // comparison) on every keystroke and modal toggle in the component.
  const filtered = useMemo(() => visibleTasks
    .filter((t) =>
      (subTab === 'All' || t.type === subTab) &&
      (userFilter === 'All' || t.doer === userFilter) &&
      // Only meaningful on the FMS tab — non-FMS tasks have no fmsName, so
      // gate on subTab rather than comparing t.fmsName directly, or picking
      // an FMS name would also hide every Delegation/Checklist row.
      (subTab !== 'FMS' || fmsNameFilter === 'All' || t.fmsName === fmsNameFilter)
    )
    .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)),
    [visibleTasks, subTab, userFilter, fmsNameFilter]);

  // When an admin picks a specific employee from the filter, the KPI cards
  // should reflect that person, not the whole org — computeDashboard() /
  // computePendingApprovals() supply a per-doer breakdown for exactly this.
  const filteringByEmployee = isAdmin && userFilter !== 'All';
  const doerStats = filteringByEmployee
    ? (data.byDoer?.[userFilter] || { total: 0, completed: 0, pending: 0, revised: 0, overdue: 0 })
    : null;

  const total     = doerStats ? doerStats.total     : (data.total     || 0);
  const completed = doerStats ? doerStats.completed : (data.completed || 0);
  const pending   = doerStats ? doerStats.pending   : (data.pending   ?? visibleTasks.length);
  const revisedCt = doerStats ? doerStats.revised   : (data.revised   || 0);
  const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;

  const firstName = (userName || '').split(' ')[0] || 'there';

  // Same hydration-safety reasoning as todayISO above: compute after mount.
  const [greeting, setGreeting]   = useState('Hello');
  const [todayLabel, setTodayLabel] = useState('');
  useEffect(() => {
    const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
    setTodayLabel(new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }));
  }, []);

  const overdueCount = doerStats ? doerStats.overdue : visibleTasks.filter((t) => t.overdue).length;

  const pa = pendingApprovals || { total: 0, mine: 0, byBranch: {}, byDoer: {} };
  const approvalCount = filteringByEmployee ? (pa.byDoer?.[userFilter] || 0) : (isAdmin ? pa.total : pa.mine);
  const approvalBranchSub = useMemo(() => {
    if (!isAdmin) return 'Awaiting approver';
    if (filteringByEmployee) return `For ${userFilter}`;
    const b = pa.byBranch || {};
    const parts = [];
    if (b.bangalore)   parts.push(`BLR ${b.bangalore}`);
    if (b.hyderabad)   parts.push(`HYD ${b.hyderabad}`);
    if (b.factory)     parts.push(`Factory ${b.factory}`);
    if (b.unspecified) parts.push(`Other ${b.unspecified}`);
    return parts.length ? parts.join(' · ') : 'None pending';
  }, [isAdmin, filteringByEmployee, userFilter, pa.byBranch]);

  /* ── handlers (unchanged) ───────────────────────────────────────── */
  async function markDone(task) {
    if (task.type === 'Delegation') {
      await fetch('/api/delegations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, status: 'done' }) });
    } else if (task.type === 'Checklist') {
      await fetch('/api/checklist-completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ masterId: task.id }) });
    }
    router.refresh();
  }


  function handleDoneClick(task) {
    if (task.type === 'FMS') { openFmsDone(task); return; }
    if (task.requireFile) { setCompletionInput(null); setFileTask(task); }
    else markDone(task);
  }



  function requestRevise(task) { setReviseNote(''); setReviseDate(''); setReviseTask({ ...task, _mode: 'request' }); }
  function requestGrant(task)  { setReviseNote(''); setReviseDate(''); setReviseTask({ ...task, _mode: 'grant'   }); }

  async function confirmRevise() {
    const task = reviseTask;
    if (!task || task.type !== 'Delegation') { setReviseTask(null); return; }
    const mode = task._mode || 'revise';
    if (mode !== 'grant' && !reviseDate) { alert('Please pick a "revise until" date.'); return; }
    if (mode === 'request' && !reviseNote.trim()) { alert('Revise note is required — please explain what needs to be revised.'); return; }
    setReviseSaving(true);
    try {
      await fetch('/api/delegations', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id, status: 'revise', _grantRevise: mode === 'grant',
          remarks: reviseNote || undefined,
          ...(mode !== 'grant' && reviseDate ? { dueDate: reviseDate } : {}),
        }),
      });
      setReviseTask(null); setReviseNote(''); setReviseDate(''); router.refresh();
    } finally { setReviseSaving(false); }
  }

  function denyRevise(task) {
    ask('Deny this revise request?', async () => {
      await fetch('/api/delegations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, status: 'pending' }) });
      router.refresh();
    });
  }

  /* ── Performance data for HorizBarChart ────────────────────────── */
  const perfTop5    = (performance?.top5    || []).map(p => ({ name: p.name, value: p.completed }));
  const perfBottom  = (performance?.bottom5 || []).map(p => ({ name: p.name, value: p.pending   }));
  const perfActive  = (performance?.mostActive || []).map(p => ({ name: p.name, value: p.total   }));

  /* ── render ─────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[21px] font-semibold tracking-tight text-slate-900">
            {greeting}, <span className="text-slate-900">{firstName}</span> 
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
            <span>{todayLabel}</span>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="input !w-auto !py-2 !text-[12.5px]">
              <option value="All">All Employees</option>
              {allDoers.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {isAdmin && (
            <button onClick={() => setHolidayOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-medium bg-white text-amber-600 border border-amber-200 hover:bg-amber-50 transition shadow-sm">
              <CalIcon /> Holidays
            </button>
          )}
          <button onClick={() => setMasterOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-medium bg-white text-emerald-600 border border-emerald-200 hover:bg-emerald-50 transition shadow-sm">
            <PlusIcon /> Checklist
          </button>
          <button onClick={() => setDelegateOpen(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold bg-primary-600 hover:bg-primary-500 text-white transition shadow-sm shadow-primary-600/20">
            <PlusIcon /> Delegate Task
          </button>
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────── */}
      <StatGrid cols={5}>
        <StatCard
          tone="gold" label="Total Tasks" value={total} icon="clipboard"
          sub={filteringByEmployee ? userFilter : isAdmin ? 'All employees' : 'Assigned to you'}
        />
        <StatCard
          tone="emerald" label="Completed" value={completed} icon="check"
          sub={`${rate}% completion rate`} progress={rate}
        />
        <StatCard
          tone="amber" label="Pending" value={pending} icon="clock"
          sub={revisedCt > 0 ? `${revisedCt} in revision` : 'Awaiting action'}
          subTone={revisedCt > 0 ? 'amber' : ''}
        />
        <StatCard
          tone="red" label="Overdue" value={overdueCount} icon="alert"
          sub={overdueCount === 0 ? 'None overdue' : `${overdueCount} past due date`}
          subTone={overdueCount > 0 ? 'red' : ''}
        />
        <StatCard
          tone="slate" label="Pending Approval" value={approvalCount} icon="checkCircle"
          sub={approvalBranchSub}
          onClick={() => router.push('/approvals?tab=task')}
        />
      </StatGrid>

      {/* ── Tasks + Overview ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">

        {/* Tasks card */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 bg-slate-50/60">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center"><IconList /></div>
              <div>
                <h2 className="text-[13.5px] font-semibold text-slate-900">Pending Tasks</h2>
                <p className="text-[11.5px] text-slate-500">{filtered.length} awaiting action</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {subTab === 'FMS' && allFmsNames.length > 0 && (
                <select value={fmsNameFilter} onChange={(e) => setFmsNameFilter(e.target.value)} className="input !w-auto !py-2 !text-[12.5px]">
                  <option value="All">All FMS</option>
                  {allFmsNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
              <div className="seg">
                {['All', 'Delegation', 'Checklist', ...(FMS_ENABLED ? ['FMS'] : [])].map((t) => (
                  <button key={t} onClick={() => { setSubTab(t); if (t !== 'FMS') setFmsNameFilter('All'); }} className={`seg-btn ${subTab === t ? 'seg-btn-active' : ''}`}>{t}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-14 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 grid place-items-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
                </div>
                <div className="text-[13.5px] font-semibold text-slate-700">All caught up!</div>
                <div className="text-[12px] text-slate-500 mt-0.5">No pending tasks right now.</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                  <tr>
                    <th className="table-th">Type</th>
                    <th className="table-th">Description</th>
                    <th className="table-th">Doer</th>
                    <th className="table-th">Priority</th>
                    <th className="table-th">Due</th>
                    <th className="table-th text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="table-row">
                      <td className="table-td"><TypePill type={t.type} /></td>
                      <td className={`table-td ${t.type === 'FMS' ? 'max-w-[380px]' : 'max-w-[260px]'} font-medium text-slate-800`} title={t.type === 'FMS' ? '' : t.description}>
                        <div className="flex items-start gap-1.5">
                          <span className={t.type === 'FMS' ? 'block' : 'truncate block'}>{t.description}</span>
                          {t.url && (
                            <a href={t.url} target="_blank" rel="noopener noreferrer" title={t.url}
                              className="shrink-0 text-primary-500 hover:text-primary-700 mt-0.5">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </a>
                          )}
                          {t.image && (
                            <ZoomImg src={t.image} className="w-6 h-6 rounded object-cover border border-slate-200 shrink-0 mt-0.5" />
                          )}
                          {t.attachment && (
                            isImageAttachment(t.attachment)
                              ? <ZoomImg src={t.attachment} className="w-6 h-6 rounded object-cover border border-slate-200 shrink-0 mt-0.5" />
                              : (
                                <a href={t.attachment} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-0.5 text-primary-500 hover:text-primary-700" title="View attachment">
                                  <span><Icon name="file" className="w-3.5 h-3.5" /></span>
                                </a>
                              )
                          )}
                        </div>
                        {t.type === 'FMS' && t.details?.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                            {t.details.map(({ header, value }) => (
                              <span key={header} className="inline-flex items-center gap-1">
                                <span className="font-semibold text-slate-600">{header}:</span>
                                <DetailValue value={value} />
                              </span>
                            ))}
                          </div>
                        )}
                        {t.transferredFrom && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium border border-amber-100 mt-1" title={t.transferredBy ? `Transferred by ${t.transferredBy}` : ''}><Icon name="refresh" className="w-3.5 h-3.5" /> from {t.transferredFrom}</span>
                        )}
                      </td>
                      <td className="table-td">
                        <div className="flex items-center gap-1.5">
                          <Avatar name={t.doer} />
                          <span className="text-slate-700">{t.doer}</span>
                        </div>
                      </td>
                      <td className="table-td">
                        {t.type === 'Checklist' ? (
                          <span className="text-slate-400 text-xs">—</span>
                        ) : t.priority === 'High' ? (
                          <span className="pill bg-red-50 text-red-600 border border-red-100">High</span>
                        ) : t.priority === 'Medium' ? (
                          <span className="pill bg-amber-50 text-amber-600 border border-amber-100">Medium</span>
                        ) : (
                          <span className="pill bg-blue-50 text-blue-600 border border-blue-100">Low</span>
                        )}
                      </td>
                      <td className={`table-td whitespace-nowrap text-xs ${t.overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                        <span className="inline-flex items-center gap-1">
                          {t.overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                          {fmt(t.date)}
                        </span>
                      </td>
                      <td className="table-td">
                        <div className="flex gap-1.5 justify-end pr-2">
                          {t.type === 'Delegation' && t.status === 'approval_pending' ? (
                            <span className="pill bg-violet-50 text-violet-700"><Icon name="clock" className="w-3 h-3" /> Awaiting {t.approver || 'approval'}</span>
                          ) : t.type === 'Delegation' && t.status === 'revise_requested' ? (
                            isAdmin ? (
                              <>
                                <button onClick={() => requestGrant(t)} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">Grant</button>
                                <button onClick={() => denyRevise(t)}   className="pill bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">Deny</button>
                              </>
                            ) : (
                              <span className="pill bg-amber-50 text-amber-700"><Icon name="clock" className="w-3 h-3" /> Pending</span>
                            )
                          ) : (
                            <>
                              {(t.type === 'FMS' || !isAdmin || t.doer === userName) && (
                                <button onClick={() => handleDoneClick(t)} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"><Icon name="check" className="w-3.5 h-3.5" /> Done</button>
                              )}
                              {t.type === 'Delegation' && (
                                <button onClick={() => requestRevise(t)} className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer">Revise</button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Overview panel ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">

          {/* Completion donut */}
          <div className="card p-5 flex flex-col items-center gap-4">
            <div className="w-full flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 grid place-items-center"><IconChart /></div>
              <div>
                <h3 className="text-[13.5px] font-semibold text-slate-900">Task Overview</h3>
                <p className="text-[11.5px] text-slate-500">Overall completion status</p>
              </div>
            </div>
            <DonutChart value={completed} total={total} size={160} strokeColor="#EEBC2E" label="Complete" />
            <div className="w-full grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
              <Legend dot="#10b981" label="Done"    value={completed} />
              <Legend dot="#ef4444" label="Pending" value={pending} />
              <Legend dot="#f59e0b" label="Revised" value={revisedCt} />
            </div>
          </div>

          {/* Quick stats */}
          <div className="card p-4 space-y-3">
            <div className="text-[12px] font-bold text-slate-600 uppercase tracking-wide">Quick Stats</div>
            <StatRow icon="calendar" label="Holidays" value={holidays.length} color="#7c3aed" />
            <StatRow icon="users" label="Team Members" value={users.length} color="#2563eb" />
            {isAdmin && <StatRow icon="dot" label="Overdue" value={overdueCount} color={overdueCount > 0 ? '#dc2626' : '#10b981'} />}
          </div>
        </div>
      </div>

      {/* ── Performance — Admin only ─────────────────────────────────── */}
      {isAdmin && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 grid place-items-center"><IconTrophy /></div>
              <div>
                <h2 className="text-[13.5px] font-semibold text-slate-900">Performance &amp; Activity</h2>
                <p className="text-[11.5px] text-slate-500">Team leaderboard — last 30 days</p>
              </div>
            </div>
            <span className="pill bg-primary-50 text-primary-700 border border-primary-100">Last 30 days</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HorizBarChart
              title="Top Performers"
              subtitle="Most tasks completed"
              items={perfTop5}
              color="#10b981"
              icon="trophy"
            />
            <HorizBarChart
              title="Needs Attention"
              subtitle="Most pending tasks"
              items={perfBottom}
              color="#ef4444"
              icon="trendDown"
            />
            <HorizBarChart
              title="Most Active"
              subtitle="Highest total tasks"
              items={perfActive}
              color="#2563eb"
              icon="zap"
            />
          </div>
        </div>
      )}

      {ConfirmUI}
      <AddMasterModal   open={masterOpen}   onClose={() => setMasterOpen(false)}   users={users} />
      <AddDelegateModal open={delegateOpen} onClose={() => setDelegateOpen(false)} users={users} />
      <HolidaysModal    open={holidayOpen}  onClose={() => setHolidayOpen(false)}  holidays={holidays} />
      {fmsDone && (
        <FmsDoneModal
          fmsId={fmsDone.fmsId} row={fmsDone.row} step={fmsDone.step}
          onClose={() => setFmsDone(null)}
          onSaved={() => { setFmsDone(null); router.refresh(); }}
        />
      )}

      {/* File-required completion modal */}
      <CompletionFileModal
        task={fileTask} input={completionInput} setInput={setCompletionInput}
        uploading={fileUploading} onSubmit={submitCompletionFile}
        onClose={() => { setFileTask(null); setCompletionInput(null); }}
      />

      {/* Revise modal */}
      {reviseTask && (() => {
        const mode = reviseTask._mode || 'revise';
        const copy = {
          request: { title: 'Request Revision',     desc: 'This will be sent to admin for approval.',          btn: 'Send Request'   },
          revise:  { title: 'Confirm Revise',        desc: 'Send this task back to the doer for revision?',     btn: 'Confirm Revise' },
          grant:   { title: 'Grant Revise Request',  desc: 'Approve this revision request and send task back?', btn: 'Grant Revise'   },
        }[mode];
        return (
          <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={() => !reviseSaving && setReviseTask(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${mode === 'grant' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/></svg>
                </div>
                <div className="flex-1"><h2 className="text-base font-semibold">{copy.title}</h2><p className="text-xs text-slate-500 mt-0.5">{copy.desc}</p></div>
                <button onClick={() => setReviseTask(null)} disabled={reviseSaving} className="btn-ghost w-8 h-8 !p-0 shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="p-6 space-y-3">
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-2">
                  <div className="font-medium text-slate-800">{reviseTask.description}</div>
                  <div className="text-xs text-slate-500">Doer: <b>{reviseTask.doer}</b></div>
                  {mode === 'grant' && reviseTask.date && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 pt-2 border-t border-slate-200">
                      <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                      <span className="text-slate-400">Revise Until:</span><b className="text-primary-600">{fmt(reviseTask.date)}</b>
                    </div>
                  )}
                  {mode === 'grant' && (
                    <div className="text-xs text-slate-600 pt-2 border-t border-slate-200">
                      <span className="text-slate-400">Revise Note:</span>{' '}
                      <span className="font-medium">{reviseTask.remarks || '—'}</span>
                    </div>
                  )}
                </div>
                {(mode === 'request' || mode === 'revise') && (
                  <div>
                    <label className="label">Revise until <span className="text-red-500">*</span></label>
                    <DateField className="input" min={todayISO} value={reviseDate} onChange={(e) => setReviseDate(e.target.value)} />
                  </div>
                )}
                {mode !== 'grant' && (
                  <div>
                    <label className="label">
                      Revise note
                      {mode === 'request'
                        ? <span className="text-red-500 ml-1">*</span>
                        : <span className="text-slate-400 font-normal ml-1">(optional)</span>}
                    </label>
                    <textarea rows={3} className="input resize-none"
                      placeholder={mode === 'request' ? 'Explain what needs to be revised (required)' : 'What needs to be corrected?'}
                      value={reviseNote} onChange={(e) => setReviseNote(e.target.value)} />
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                <button onClick={() => setReviseTask(null)} disabled={reviseSaving} className="btn-secondary">Cancel</button>
                <button onClick={confirmRevise} disabled={reviseSaving} className={mode === 'grant' ? 'btn-success' : 'btn-danger'}>
                  {reviseSaving ? 'Saving…' : copy.btn}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── KPI card ───────────────────────────────────────────────────────────── */
function Legend({ dot, label, value }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
        <span className="text-[10.5px] text-slate-500 font-medium">{label}</span>
      </div>
      <div className="text-[17px] font-bold text-slate-800 mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function StatRow({ icon, label, value, color }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="w-4 h-4" style={{ color }} />
        <span className="text-[12px] font-medium text-slate-600">{label}</span>
      </div>
      <span className="text-[14px] font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

function TypePill({ type }) {
  const map = {
    Delegation: 'bg-primary-50 text-primary-700',
    FMS:        'bg-violet-50 text-violet-700',
    Checklist:  'bg-emerald-50 text-emerald-700',
  };
  return <span className={`pill ${map[type] || 'bg-slate-100 text-slate-700'}`}>{type}</span>;
}


function PlusIcon()   { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function CalIcon()    { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function IconList()   { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>; }
function IconChart()  { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M21 12A9 9 0 0 0 12 3v9z"/></svg>; }
function IconTrophy() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M6 5h12v6a6 6 0 0 1-12 0z"/><path d="M9 21h6M12 17v4"/></svg>; }

'use client';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AddMasterModal from './components/AddMasterModal';
import AddDelegateModal from './components/AddDelegateModal';
import HolidaysModal from './components/HolidaysModal';
import PieChart from './components/PieChart';
import BarList from './components/BarList';
import { FMS_ENABLED } from '@/lib/config';

export default function DashboardClient({ data, performance, holidays, users = [] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const userName = session?.user?.name?.split(' ')[0] || 'User';

  const [masterOpen, setMasterOpen]     = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [holidayOpen, setHolidayOpen]   = useState(false);
  const [reviseTask, setReviseTask]     = useState(null);   // task pending revise confirmation
  const [reviseNote, setReviseNote]     = useState('');
  const [reviseDate, setReviseDate]     = useState('');     // "revise until" date (admin sets)
  const [reviseSaving, setReviseSaving] = useState(false);
  const [subTab, setSubTab]             = useState('All');
  const [userFilter, setUserFilter]     = useState('All');

  const isAdmin = (session?.user?.roles || []).includes('Admin');
  const todayISO = new Date().toISOString().split('T')[0];
  const seenRequests = useRef(
    new Set(JSON.parse(localStorage.getItem('seenReviseRequests') || '[]'))
);
  // Admin: poll every 15s so new revise requests appear without manual reload.
  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [isAdmin, router]);

  // Admin: when a NEW revise request arrives, auto-open the grant popup.
  useEffect(() => {
    if (!isAdmin || reviseTask) return;
    const pending = (data.pendingTasks || []).filter(
      (t) => t.type === 'Delegation' && t.status === 'revise_requested'
    );
    const fresh = pending.find((t) => !seenRequests.current.has(t.id));
    if (fresh) {
  seenRequests.current.add(fresh.id);
  localStorage.setItem('seenReviseRequests', JSON.stringify([...seenRequests.current])); // 👈 add
  setReviseNote('');
  setReviseDate('');
  setReviseTask({ ...fresh, _mode: 'grant' });
}
  }, [data.pendingTasks, isAdmin, reviseTask]);

  const fmt = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const roles = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : [session?.user?.roles];

  // Non-admin sirf apne tasks dekhega
  const visibleTasks = isAdmin
    ? data.pendingTasks
    : data.pendingTasks.filter((t) => t.doer === session?.user?.name);

  const allDoers = useMemo(() => users.map((u) => u.name).sort(), [users]);

  const filtered = visibleTasks.filter((t) =>
    (subTab === 'All' || t.type === subTab) &&
    (userFilter === 'All' || t.doer === userFilter)
  );

  // Pie chart ke liye visible tasks ka stats
  const visibleCompleted = isAdmin ? data.completed : 0;
  const visiblePending = visibleTasks.length;
  const visibleRevised = isAdmin ? data.revised : 0;

  const completionPct = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;

  async function markDone(task) {
    if (task.type === 'Delegation') {
      await fetch('/api/delegations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, status: 'done' }) });
    } else if (task.type === 'FMS') {
      const parts = task.id.split('-');
      const stepIndex = parseInt(parts.pop());
      const fmsId = parts.join('-');
      await fetch('/api/fms/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fmsId, stepIndex }) });
    }
    router.refresh();
  }

  // ----- Revise approval workflow -----
  // mode: 'request' (non-admin asks), 'revise' (admin direct), 'grant' (admin approves a request)
  function requestRevise(task) {
  setReviseNote('');
  setReviseDate('');
  setReviseTask({ ...task, _mode: 'request' });
}
  function requestGrant(task) {
    setReviseNote('');
    setReviseDate('');
    setReviseTask({ ...task, _mode: 'grant' });
  }

  async function confirmRevise() {
    const task = reviseTask;
    if (!task || task.type !== 'Delegation') { setReviseTask(null); return; }
    const mode = task._mode || 'revise';
    // Admin must set a "revise until" date when granting / revising directly.
    if ((mode === 'grant' || mode === 'revise') && !reviseDate) {
      alert('Please pick a "revise until" date.');
      return;
    }
    setReviseSaving(true);
    try {
      await fetch('/api/delegations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          status: 'revise',
          remarks: reviseNote || undefined,
          dueDate: reviseDate || undefined,
        }),
      });
      setReviseTask(null);
      setReviseNote('');
      setReviseDate('');
      router.refresh();
    } finally {
      setReviseSaving(false);
    }
  }

  async function denyRevise(task) {
    if (!confirm('Deny this revise request? Task will go back to pending.')) return;
    await fetch('/api/delegations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: 'pending' }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-600 via-primary-700 to-violet-700 text-white p-5 shadow-elevated">
        <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -right-24 -bottom-20 w-64 h-64 rounded-full bg-pink-400/20 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '20px 20px' }} />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium text-primary-100/90 uppercase tracking-wider mb-1.5">Welcome back</div>
            <h1 className="text-[20px] font-bold tracking-tight">Hi, {userName} 👋</h1>
            <p className="text-primary-100/90 mt-1 text-[12.5px] max-w-xl">
              You have <span className="font-semibold text-white">{visibleTasks.length}</span> pending tasks. Completion sits at <span className="font-semibold text-white">{completionPct}%</span>.
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => setHolidayOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-white/10 hover:bg-white/20 text-white border border-white/15 backdrop-blur transition">
              <CalIcon /> Holidays
            </button>
            
              <>
                <button onClick={() => setMasterOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-white/10 hover:bg-white/20 text-white border border-white/15 backdrop-blur transition">
                  <PlusIcon /> Checklist
                </button>
                <button onClick={() => setDelegateOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-white text-primary-700 hover:bg-primary-50 transition shadow-sm">
                  <PlusIcon /> Delegation
                </button>
              </>
            
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Tasks" value={isAdmin ? data.total : visibleTasks.length} tone="primary" icon={<TaskIcon />} trend={`${completionPct}%`} trendLabel="complete" />
        <StatCard label="Completed"   value={isAdmin ? data.completed : 0}               tone="emerald" icon={<CheckIcon />} trend="On track" trendUp />
        <StatCard label="Pending"     value={visibleTasks.length}                         tone="red"     icon={<ClockIcon />} trend={data.revised > 0 ? `${data.revised} revised` : 'Action needed'} trendDown />
      </div>

      {/* Filter bar */}
      <div className="card p-2.5 flex items-center gap-2 flex-wrap">
        <div className="seg">
          {['All', 'Delegation', 'Checklist', ...(FMS_ENABLED ? ['FMS'] : [])].map((t) => (
            <button key={t} onClick={() => setSubTab(t)} className={`seg-btn ${subTab === t ? 'seg-btn-active' : ''}`}>{t}</button>
          ))}
        </div>
        {isAdmin && (
          <>
            <div className="w-px h-5 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="input !w-auto !py-1">
                <option value="All">All Users</option>
                {allDoers.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </>
        )}
        <div className="flex-1" />
        <div className="text-[11.5px] text-slate-500">
          {filtered.length} of {visibleTasks.length} pending
        </div>
      </div>

      {/* Pending + Donut */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 grid place-items-center text-red-600">
              <ClockIcon />
            </div>
            <div>
              <h2 className="text-[13.5px] font-semibold text-slate-900">Pending Tasks</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">{filtered.length} awaiting action{userFilter !== 'All' ? ` · ${userFilter}` : ''}</p>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 grid place-items-center mx-auto mb-2.5">
                  <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
                </div>
                <div className="text-[13px] font-medium text-slate-700">All caught up</div>
                <div className="text-[11px] text-slate-500 mt-0.5">No pending tasks{userFilter !== 'All' ? ` for ${userFilter}` : ''}.</div>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur">
                  <tr>
                    <th className="table-th">Type</th>
                    <th className="table-th">Description</th>
                    <th className="table-th">Doer</th>
                    <th className="table-th">Due</th>
                    <th className="table-th">Client</th>
                    <th className="table-th text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="table-row">
                      <td className="table-td"><TypePill type={t.type} /></td>
                      <td className="table-td max-w-[280px] truncate font-medium text-slate-800" title={t.description}>{t.description}</td>
                      <td className="table-td">
                        <div className="flex items-center gap-1.5">
                          <Avatar name={t.doer} />
                          <span>{t.doer}</span>
                        </div>
                      </td>
                      <td className={`table-td whitespace-nowrap ${t.overdue ? 'text-red-600 font-semibold' : ''}`}>
                        {t.overdue && <span className="pill bg-red-50 text-red-700 mr-1">overdue</span>}
                        {fmt(t.date)}
                      </td>
                      <td className="table-td text-slate-600">{t.client || '—'}</td>
                      <td className="table-td">
                        <div className="flex gap-1 justify-end">
                          {t.type === 'Delegation' && t.status === 'revise_requested' ? (
                            isAdmin ? (
                              <>
                                <button onClick={() => requestGrant(t)} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer transition">Grant</button>
                                <button onClick={() => denyRevise(t)} className="pill bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer transition">Deny</button>
                              </>
                            ) : (
                              <span className="pill bg-amber-50 text-amber-700">⏳ Revise requested</span>
                            )
                          ) : (
                            <>
                              <button onClick={() => markDone(t)} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer transition">Done</button>
                              {t.type === 'Delegation' && (
                                <button onClick={() => requestRevise(t)} className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer transition">Revise</button>
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

        <div className="card p-4 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-[13.5px] font-semibold text-slate-900">Task Overview</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Current distribution</p>
            </div>
            <span className="pill bg-slate-100 text-slate-600">Today</span>
          </div>
          <div className="flex-1 flex items-center justify-center pt-1">
            <PieChart
              completed={visibleCompleted}
              pending={visiblePending}
              revised={visibleRevised}
            />
          </div>
        </div>
      </div>

      {/* Performance — sirf Admin ko dikhao */}
      {isAdmin && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-50 grid place-items-center text-primary-600">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/></svg>
              </div>
              <div>
                <h2 className="text-[13.5px] font-semibold text-slate-900">Performance & Activity</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">Team leaderboard</p>
              </div>
            </div>
            <span className="pill bg-primary-50 text-primary-700 border border-primary-100">Last 30 days</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <BarList title="Top Performers"  items={performance.top5}       valueKey="completed" tone="emerald" icon="★" />
            <BarList title="Needs Attention" items={performance.bottom5}    valueKey="pending"   tone="red"     icon="!" />
            <BarList title="Most Active"     items={performance.mostActive} valueKey="total"     tone="blue"    icon="⚡" />
          </div>
        </div>
      )}

      <AddMasterModal open={masterOpen} onClose={() => setMasterOpen(false)} users={users} />
      <AddDelegateModal open={delegateOpen} onClose={() => setDelegateOpen(false)} users={users} />
      <HolidaysModal    open={holidayOpen}  onClose={() => setHolidayOpen(false)} holidays={holidays} />

      {/* Revise approval popup (request / direct revise / grant) */}
      {reviseTask && (() => {
        const mode = reviseTask._mode || 'revise';
        const copy = {
          request: { title: 'Request Revision', desc: 'This will be sent to the admin for approval.', btn: 'Send Request' },
          revise:  { title: 'Confirm Revise',   desc: 'Send this task back to the doer for revision?', btn: 'Confirm Revise' },
          grant:   { title: 'Grant Revise Request', desc: 'Approve this revision request and send the task back?', btn: 'Grant Revise' },
        }[mode];
        return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => !reviseSaving && setReviseTask(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl grid place-items-center ${mode === 'grant' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/></svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900">{copy.title}</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">{copy.desc}</p>
              </div>
            </div>
            <div className="p-6 space-y-3">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-[13px]">
                <div className="font-medium text-slate-800">{reviseTask.description}</div>
                <div className="text-[12px] text-slate-500 mt-0.5">Doer: <b>{reviseTask.doer}</b></div>
                {mode === 'grant' && reviseTask.remarks && (
                  <div className="text-[12px] text-slate-600 mt-2 pt-2 border-t border-slate-200">
                    <span className="text-slate-400">Requested note:</span> {reviseTask.remarks}
                  </div>
                )}
              </div>
              {(mode === 'grant' || mode === 'revise') && (
                <div>
                  <label className="label">Revise until <span className="text-red-500">*</span></label>
                  <input type="date" className="input" min={todayISO}
                    value={reviseDate} onChange={(e) => setReviseDate(e.target.value)} />
                  <div className="text-[11px] text-slate-400 mt-1"></div>
                </div>
              )}
              {mode !== 'grant' && (
                <div>
                  <label className="label">Revise note <span className="text-slate-400 font-normal">(optional — reason for the doer)</span></label>
                  <textarea rows={3} className="input resize-none" placeholder="What needs to be corrected?"
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

const TONES = {
  primary: { bg: 'bg-primary-50',  text: 'text-primary-600', accent: 'bg-primary-500',  ring: 'ring-primary-100' },
  emerald: { bg: 'bg-emerald-50',  text: 'text-emerald-600', accent: 'bg-emerald-500',  ring: 'ring-emerald-100' },
  red:     { bg: 'bg-red-50',      text: 'text-red-600',     accent: 'bg-red-500',      ring: 'ring-red-100' },
  amber:   { bg: 'bg-amber-50',    text: 'text-amber-600',   accent: 'bg-amber-500',    ring: 'ring-amber-100' },
};

function StatCard({ label, value, tone = 'primary', icon, trend, trendLabel, trendUp, trendDown }) {
  const t = TONES[tone];
  return (
    <div className="relative card card-hover p-4 overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${t.accent}`} />
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg grid place-items-center ${t.bg} ${t.text} ring-4 ${t.ring}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[10.5px] font-semibold ${trendUp ? 'text-emerald-600' : trendDown ? 'text-red-600' : 'text-slate-500'}`}>
          {trendUp   && <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6"/></svg>}
          {trendDown && <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>}
          <span>{trend}</span>
        </div>
      </div>
      <div className="mt-3">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <div className="text-[26px] font-bold text-slate-900 tracking-tight leading-none">{value}</div>
          {trendLabel && <div className="text-[11px] text-slate-500">{trendLabel}</div>}
        </div>
      </div>
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

function Avatar({ name = '' }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '·';
  const palette = ['from-rose-400 to-pink-600','from-amber-400 to-orange-600','from-emerald-400 to-teal-600','from-primary-400 to-primary-600','from-violet-400 to-purple-600','from-sky-400 to-cyan-600'];
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const grad = palette[hash % palette.length];
  return <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${grad} text-white grid place-items-center text-[9px] font-bold shrink-0`}>{ini}</div>;
}

function PlusIcon() { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function CalIcon()  { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function TaskIcon() { return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11h6M9 7h6M9 15h4"/><rect x="4" y="3" width="16" height="18" rx="2"/></svg>; }
function CheckIcon(){ return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>; }
function ClockIcon(){ return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>; }
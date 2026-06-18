'use client';
import { useMemo, useState, useEffect } from 'react';

import { useRouter } from 'next/navigation';
import AddMasterModal from './components/AddMasterModal';
import AddDelegateModal from './components/AddDelegateModal';
import HolidaysModal from './components/HolidaysModal';
import { useConfirmToast } from './components/ConfirmToast';
import PieChart from './components/PieChart';
import BarList from './components/BarList';
import { FMS_ENABLED } from '@/lib/config';

export default function DashboardClient({ data, performance, holidays, users = [], isAdmin, userName = '' }) {
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
  const { ask, ConfirmUI } = useConfirmToast();

  const todayISO = new Date().toISOString().split('T')[0];
  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(() => router.refresh(), 60000);
    return () => clearInterval(t);
  }, [isAdmin, router]);

  const fmt = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  };

  const visibleTasks = data.pendingTasks;
  const allDoers = useMemo(() => users.map((u) => u.name).sort(), [users]);

  const filtered = visibleTasks
    .filter((t) =>
      (subTab === 'All' || t.type === subTab) &&
      (userFilter === 'All' || t.doer === userFilter)
    )
    .slice()
    .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

  const total     = data.total || 0;
  const completed = data.completed || 0;
  const pending   = data.pending ?? visibleTasks.length;
  const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;

  // greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (userName || '').split(' ')[0] || 'there';
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  async function markDone(task) {
    if (task.type === 'Delegation') {
      await fetch('/api/delegations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, status: 'done' }) });
    } else if (task.type === 'Checklist') {
      await fetch('/api/checklist-completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ masterId: task.id }) });
    } else if (task.type === 'FMS') {
      const parts = task.id.split('-'); const stepIndex = parseInt(parts.pop()); const fmsId = parts.join('-');
      await fetch('/api/fms/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fmsId, stepIndex }) });
    }
    router.refresh();
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
          id: task.id,
          status: 'revise',
          _grantRevise: mode === 'grant',
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

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-slate-900">
            {greeting}, <span className="text-primary-600">{firstName}</span> 👋
          </h1>
          <p className="text-[12.5px] text-slate-500 mt-0.5 flex items-center gap-2">
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

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi tone="blue"    label="Total Tasks" value={total}     icon={<IconLayers />} sub={`${isAdmin ? 'All employees' : 'Assigned to you'}`} />
        <Kpi tone="emerald" label="Completed"   value={completed} icon={<IconCheck />}  sub={`${rate}% completion`} />
        <Kpi tone="red"     label="Pending"     value={pending}   icon={<IconClock />}  sub={data.revised > 0 ? `${data.revised} in revision` : 'Awaiting action'} subTone={data.revised > 0 ? 'amber' : ''} />
        <Kpi tone="violet"  label="Completion"  value={`${rate}%`} ring={rate}          sub={`${completed} of ${total} done`} />
      </div>

      {/* ── Tasks + Overview ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">

        {/* Tasks card */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 bg-gradient-to-r from-slate-50/80 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center"><IconList /></div>
              <div>
                <h2 className="text-[13.5px] font-semibold text-slate-900">Pending Tasks</h2>
                <p className="text-[11.5px] text-slate-500">{filtered.length} awaiting action</p>
              </div>
            </div>
            <div className="seg">
              {['All', 'Delegation', 'Checklist', ...(FMS_ENABLED ? ['FMS'] : [])].map((t) => (
                <button key={t} onClick={() => setSubTab(t)} className={`seg-btn ${subTab === t ? 'seg-btn-active' : ''}`}>{t}</button>
              ))}
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
                      <td className="table-td max-w-[260px] font-medium text-slate-800" title={t.description}>
                        <div className="flex items-start gap-1.5">
                          <span className="truncate block">{t.description}</span>
                          {t.url && (
                            <a href={t.url} target="_blank" rel="noopener noreferrer" title={t.url}
                              className="shrink-0 text-primary-500 hover:text-primary-700 mt-0.5">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </a>
                          )}
                        </div>
                        {t.transferredFrom && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium border border-amber-100 mt-1" title={t.transferredBy ? `Transferred by ${t.transferredBy}` : ''}>🔄 from {t.transferredFrom}</span>
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
                          {t.overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                          {fmt(t.date)}
                        </span>
                      </td>
                      <td className="table-td">
                        <div className="flex gap-1.5 justify-end pr-2">
                          {t.type === 'Delegation' && t.status === 'revise_requested' ? (
                            isAdmin ? (
                              <>
                                <button onClick={() => requestGrant(t)} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">Grant</button>
                                <button onClick={() => denyRevise(t)}   className="pill bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">Deny</button>
                              </>
                            ) : (
                              <span className="pill bg-amber-50 text-amber-700">⏳ Pending</span>
                            )
                          ) : (
                            <>
                              <button onClick={() => markDone(t)} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">✓ Done</button>
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

        {/* Overview card */}
        <div className="card p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 grid place-items-center"><IconChart /></div>
            <div>
              <h3 className="text-[13.5px] font-semibold text-slate-900">Task Overview</h3>
              <p className="text-[11.5px] text-slate-500">Overall distribution</p>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center py-2">
            <PieChart completed={completed} pending={pending} revised={data.revised} />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
            <Legend dot="bg-emerald-500" label="Done"    value={completed} />
            <Legend dot="bg-red-500"     label="Pending" value={pending} />
            <Legend dot="bg-amber-500"   label="Revised" value={data.revised} />
          </div>
        </div>
      </div>

      {/* ── Performance — Admin only ────────────────────────────────────── */}
      {isAdmin && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 grid place-items-center"><IconTrophy /></div>
              <div>
                <h2 className="text-[13.5px] font-semibold text-slate-900">Performance &amp; Activity</h2>
                <p className="text-[11.5px] text-slate-500">Team leaderboard</p>
              </div>
            </div>
            <span className="pill bg-primary-50 text-primary-700 border border-primary-100">Last 30 days</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BarList title="🏆 Top 5 Performers"   items={performance.top5}       valueKey="completed" tone="emerald" icon="★" />
            <BarList title="📉 Bottom 5 Performers" items={performance.bottom5}    valueKey="pending"   tone="red"    icon="!" />
            <BarList title="⚡ Top 5 Most Active"   items={performance.mostActive} valueKey="total"     tone="blue"   icon="⚡" />
          </div>
        </div>
      )}

      {ConfirmUI}
      <AddMasterModal   open={masterOpen}   onClose={() => setMasterOpen(false)}   users={users} />
      <AddDelegateModal open={delegateOpen} onClose={() => setDelegateOpen(false)} users={users} />
      <HolidaysModal    open={holidayOpen}  onClose={() => setHolidayOpen(false)}  holidays={holidays} />

      {/* Revise modal */}
      {reviseTask && (() => {
        const mode = reviseTask._mode || 'revise';
        const copy = {
          request: { title: 'Request Revision',       desc: 'This will be sent to admin for approval.',          btn: 'Send Request'   },
          revise:  { title: 'Confirm Revise',          desc: 'Send this task back to the doer for revision?',     btn: 'Confirm Revise' },
          grant:   { title: 'Grant Revise Request',    desc: 'Approve this revision request and send task back?', btn: 'Grant Revise'   },
        }[mode];
        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !reviseSaving && setReviseTask(null)}>
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
                      <span className="text-slate-400">Revise Until:</span>
                      <b className="text-primary-600">{fmt(reviseTask.date)}</b>
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
                    <input type="date" className="input" min={todayISO} value={reviseDate} onChange={(e) => setReviseDate(e.target.value)} />
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
                    <textarea rows={3} className="input resize-none" placeholder={mode === 'request' ? 'Explain what needs to be revised (required)' : 'What needs to be corrected?'} value={reviseNote} onChange={(e) => setReviseNote(e.target.value)} />
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

/* ── KPI card ──────────────────────────────────────────────────────────── */
const TONES = {
  blue:    { text: 'text-primary-600', soft: 'bg-primary-50 text-primary-600', ring: '#2E72B5' },
  emerald: { text: 'text-emerald-600', soft: 'bg-emerald-50 text-emerald-600', ring: '#10b981' },
  red:     { text: 'text-red-500',     soft: 'bg-red-50 text-red-500',         ring: '#ef4444' },
  violet:  { text: 'text-violet-600',  soft: 'bg-violet-50 text-violet-600',   ring: '#8b5cf6' },
  amber:   { text: 'text-amber-600',   soft: 'bg-amber-50 text-amber-600',     ring: '#f59e0b' },
};

function Kpi({ label, value, tone = 'blue', icon, sub, subTone, ring }) {
  const t = TONES[tone] || TONES.blue;
  return (
    <div className="card card-hover p-4 relative overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-1 rounded-r" style={{ background: t.ring }} />
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
          <div className={`text-[30px] leading-none font-bold mt-2 ${t.text}`}>{value}</div>
          {sub && <div className={`text-[11px] mt-2 font-medium ${subTone ? (TONES[subTone]?.text || 'text-slate-400') : 'text-slate-400'}`}>{sub}</div>}
        </div>
        {ring != null ? (
          <Ring pct={ring} color={t.ring} />
        ) : (
          <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${t.soft}`}>{icon}</div>
        )}
      </div>
    </div>
  );
}

function Ring({ pct = 0, color }) {
  return (
    <div className="relative w-12 h-12 shrink-0 rounded-full" style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, #eef2f7 0)` }}>
      <div className="absolute inset-[3px] rounded-full bg-white grid place-items-center text-[10px] font-bold" style={{ color }}>{pct}%</div>
    </div>
  );
}

function Legend({ dot, label, value }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span className="text-[10.5px] text-slate-500 font-medium">{label}</span>
      </div>
      <div className="text-[16px] font-bold text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

function TypePill({ type }) {
  const map = { Delegation: 'bg-primary-50 text-primary-700', FMS: 'bg-violet-50 text-violet-700', Checklist: 'bg-emerald-50 text-emerald-700' };
  return <span className={`pill ${map[type] || 'bg-slate-100 text-slate-700'}`}>{type}</span>;
}

function Avatar({ name = '' }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '·';
  const palette = ['from-rose-400 to-pink-600','from-amber-400 to-orange-600','from-emerald-400 to-teal-600','from-primary-400 to-primary-600','from-violet-400 to-purple-600'];
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${palette[hash % palette.length]} text-white grid place-items-center text-[9px] font-bold shrink-0`}>{ini}</div>;
}

function PlusIcon()   { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function CalIcon()    { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function IconLayers() { return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>; }
function IconCheck()  { return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>; }
function IconClock()  { return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>; }
function IconList()   { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>; }
function IconChart()  { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M21 12A9 9 0 0 0 12 3v9z"/></svg>; }
function IconTrophy() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M6 5h12v6a6 6 0 0 1-12 0z"/><path d="M9 21h6M12 17v4"/></svg>; }

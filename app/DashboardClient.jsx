'use client';
import { useMemo, useState, useEffect } from 'react';

import { useRouter } from 'next/navigation';
import AddMasterModal from './components/AddMasterModal';
import AddDelegateModal from './components/AddDelegateModal';
import HolidaysModal from './components/HolidaysModal';
import PieChart from './components/PieChart';
import BarList from './components/BarList';
import { FMS_ENABLED } from '@/lib/config';

export default function DashboardClient({ data, performance, holidays, users = [], isAdmin }) {
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

  const todayISO = new Date().toISOString().split('T')[0];
  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [isAdmin, router]);

  const fmt = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  };

  const visibleTasks = data.pendingTasks;

  const allDoers = useMemo(() => users.map((u) => u.name).sort(), [users]);

  const STATUS_RANK = { revise: 0, revise_requested: 1, pending: 2, done: 3 };

  const filtered = visibleTasks
    .filter((t) =>
      (subTab === 'All' || t.type === subTab) &&
      (userFilter === 'All' || t.doer === userFilter)
    )
    .slice()
    .sort((a, b) => (STATUS_RANK[a.status] ?? 2) - (STATUS_RANK[b.status] ?? 2));

  const visibleCompleted = data.completed;
  const visibleRevised   = data.revised;

  async function markDone(task) {
    if (task.type === 'Delegation') {
      await fetch('/api/delegations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, status: 'done' }) });
    } else if (task.type === 'Checklist') {
      await fetch('/api/checklist-completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ masterId: task.id }) });
    } else if (task.type === 'FMS') {
      const parts = task.id.split('-'); const stepIndex = parseInt(parts.pop()); const fmsId = parts.join('-');
      await fetch('/api/fms/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fmsId, stepIndex }) });
    }
    window.location.reload();
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

  async function denyRevise(task) {
    if (!confirm('Deny this revise request?')) return;
    await fetch('/api/delegations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, status: 'pending' }) });
    router.refresh();
  }

  return (
    <div className="space-y-5 animate-fade-in" style={{ minWidth: '900px' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="input !w-auto !py-1.5 !text-sm">
              <option value="All">All Employees</option>
              {allDoers.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {isAdmin && (
            <button onClick={() => setHolidayOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition shadow-sm">
              <CalIcon /> Holidays
            </button>
          )}
          <button onClick={() => setMasterOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition shadow-sm">
            <PlusIcon /> Checklist
          </button>
          <button onClick={() => setDelegateOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white transition shadow-sm">
            <PlusIcon /> Delegate
          </button>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <div className="card p-5">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total</div>
          <div className="text-4xl font-bold text-primary-600">{isAdmin ? data.total : visibleTasks.length}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Completed</div>
          <div className="text-4xl font-bold text-emerald-500">{data.completed}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Pending</div>
          <div className="text-4xl font-bold text-red-500">{visibleTasks.length}</div>
          {data.revised > 0 && (
            <div className="text-xs font-semibold text-amber-500 mt-1">{data.revised} revised</div>
          )}
        </div>
      </div>

      {/* ── Pending tasks + Pie ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1rem' }}>

        {/* Tasks card */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">All Pending Tasks</h2>
              <p className="text-xs text-slate-500 mt-0.5">{filtered.length} awaiting action</p>
            </div>
            {/* Inline tabs */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {['All', 'Delegation', 'Checklist', ...(FMS_ENABLED ? ['FMS'] : [])].map((t) => (
                <button key={t} onClick={() => setSubTab(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${subTab === t ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 grid place-items-center mx-auto mb-2.5">
                  <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
                </div>
                <div className="text-sm font-medium text-slate-700">All caught up!</div>
                <div className="text-xs text-slate-500 mt-0.5">No pending tasks.</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur">
                  <tr>
                    <th className="table-th">Type</th>
                    <th className="table-th">Description</th>
                    <th className="table-th">Doer</th>
                    <th className="table-th">Priority</th>
                    <th className="table-th">Date</th>
                    <th className="table-th">Action</th>
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
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium border border-amber-100" title={t.transferredBy ? `Transferred by ${t.transferredBy}` : ''}>🔄 from {t.transferredFrom}</span>
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
                        ) : t.priority && t.priority !== 'Low' ? (
                          <span className={`pill ${t.priority === 'High' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                            {t.priority}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Low</span>
                        )}
                      </td>
                      <td className={`table-td whitespace-nowrap text-xs ${t.overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                        {fmt(t.date)}
                      </td>
                      <td className="table-td">
                        <div className="flex gap-1.5">
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
                              <button onClick={() => markDone(t)} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">Done</button>
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

        {/* Pie chart card */}
        <div className="card p-4 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Task Overview</h3>
              <p className="text-xs text-slate-500 mt-0.5">Overall distribution</p>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center pt-2">
            <PieChart completed={visibleCompleted} pending={visibleTasks.length} revised={visibleRevised} />
          </div>
        </div>
      </div>

      {/* ── Performance — Admin only ────────────────────────────────────── */}
      {isAdmin && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Performance & Activity</h2>
                <p className="text-xs text-slate-500">Team leaderboard</p>
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
                {/* Date picker: user request mein dikhao, admin grant mein nahi */}
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

function FolderIcon() { return <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>; }
function PlusIcon()   { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function CalIcon()    { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }

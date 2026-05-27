'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AddDelegateModal from '../components/AddDelegateModal';
import { FMS_ENABLED } from '@/lib/config';

export default function AllTasksClient({ grouped, users }) {
  const router = useRouter();
  const [tab, setTab] = useState('Delegation');
  const [statusTab, setStatusTab] = useState('All');
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [delegateOpen, setDelegateOpen] = useState(false);

  const fmt = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Map each top tab to the task type it should show
  const tabType = {
    'Delegation': 'Delegation',
    'Checklist': 'Checklist',
    'Delegate by Me': 'Delegation',
    'FMS Tasks': 'FMS',
  };

  const filterTasks = (tasks) => {
    let arr = tasks;
    const wantType = tabType[tab];
    if (wantType) arr = arr.filter((t) => (t.type || 'Delegation') === wantType);
    if (statusTab === 'Pending')   arr = arr.filter((t) => t.status === 'pending' || t.status === 'revise');
    else if (statusTab === 'Completed') arr = arr.filter((t) => t.status === 'done');
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter((t) => t.description.toLowerCase().includes(s) || (t.client || '').toLowerCase().includes(s));
    }
    return arr;
  };

  const visibleGroups = grouped.map((g) => ({ ...g, tasks: filterTasks(g.tasks) })).filter((g) => g.tasks.length > 0);
  const totalTasks = visibleGroups.reduce((s, g) => s + g.tasks.length, 0);

  function expandAll()  { const o = {}; visibleGroups.forEach((g) => o[g.doer] = true); setExpanded(o); }
  function collapseAll(){ setExpanded({}); }

  async function updateStatus(id, status) {
    await fetch('/api/delegations', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">All Tasks</h1>
          <p className="page-sub">Browse and manage every assignment across the team</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-secondary">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 3 4 4-4 4"/><path d="M21 7H4"/><path d="m7 21-4-4 4-4"/><path d="M3 17h17"/></svg>
            Transfer
          </button>
          <button onClick={() => setDelegateOpen(true)} className="btn-primary">
            <PlusIcon /> Delegate Task
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <div className="seg">
          {['Delegation', 'Checklist', 'Delegate by Me', ...(FMS_ENABLED ? ['FMS Tasks'] : [])].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`seg-btn ${tab === t ? 'seg-btn-active' : ''}`}>{t}</button>
          ))}
        </div>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <select className="input !w-auto !py-1.5">
          <option>All Employees</option>
        </select>
        <input type="date" className="input !w-auto !py-1.5" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" className="input !w-auto !py-1.5" />
        <div className="flex-1" />
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description, client…" className="input pl-9 w-72" />
        </div>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="seg">
          {['All', 'Pending', 'Completed'].map((t) => (
            <button key={t} onClick={() => setStatusTab(t)} className={`seg-btn ${statusTab === t ? 'seg-btn-active' : ''}`}>{t}</button>
          ))}
        </div>
        <div className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{visibleGroups.length}</span> doer{visibleGroups.length === 1 ? '' : 's'} ·{' '}
          <span className="font-semibold text-slate-800">{totalTasks}</span> task{totalTasks === 1 ? '' : 's'}
        </div>
        <div className="flex gap-1 text-xs">
          <button onClick={expandAll} className="btn-ghost !py-1 !px-2">Expand all</button>
          <button onClick={collapseAll} className="btn-ghost !py-1 !px-2">Collapse all</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {visibleGroups.length === 0 ? (
          <div className="p-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-3">
              <svg className="w-7 h-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
            </div>
            <div className="text-sm font-medium text-slate-700">No tasks match the filters</div>
            <div className="text-xs text-slate-500 mt-1">Try clearing search or changing the tab.</div>
          </div>
        ) : (
          <ul>
            {visibleGroups.map((g) => {
              const pendingCount   = g.tasks.filter((t) => t.status === 'pending').length;
              const completedCount = g.tasks.filter((t) => t.status === 'done').length;
              const revisedCount   = g.tasks.filter((t) => t.status === 'revise').length;
              const isOpen = expanded[g.doer];

              return (
                <li key={g.doer} className="border-b border-slate-100 last:border-0">
                  <button
                    onClick={() => setExpanded({ ...expanded, [g.doer]: !isOpen })}
                    className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 text-left transition"
                  >
                    <span className="flex items-center gap-3">
                      <span className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                      </span>
                      <Avatar name={g.doer} />
                      <span className="font-medium text-slate-800 text-sm">{g.doer}</span>
                    </span>
                    <div className="flex gap-1.5 items-center">
                      {completedCount > 0 && <span className="pill bg-emerald-50 text-emerald-700">{completedCount} done</span>}
                      {pendingCount   > 0 && <span className="pill bg-red-50 text-red-700">{pendingCount} pending</span>}
                      {revisedCount   > 0 && <span className="pill bg-amber-50 text-amber-700">{revisedCount} revised</span>}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="bg-slate-50/40 px-5 py-3 border-t border-slate-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-2 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500">Description</th>
                            <th className="text-left px-2 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 w-32">Due</th>
                            <th className="text-left px-2 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 w-32">Client</th>
                            <th className="text-left px-2 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 w-40">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.tasks.map((t) => (
                            <tr key={t.id} className="border-t border-slate-200/60">
                              <td className="px-2 py-2.5 text-slate-700">{t.description}</td>
                              <td className="px-2 py-2.5 text-slate-600 whitespace-nowrap">{t.type === 'Checklist' ? (t.frequency || 'Recurring') : fmt(t.dueDate)}</td>
                              <td className="px-2 py-2.5 text-slate-600">{t.client || '—'}</td>
                              <td className="px-2 py-2.5">
                                {t.type === 'Checklist' ? (
                                  <span className="pill bg-emerald-50 text-emerald-700">Recurring</span>
                                ) : t.status === 'done' ? (
                                  <span className="pill bg-emerald-50 text-emerald-700">✓ Done</span>
                                ) : t.status === 'revise' ? (
                                  <div className="flex gap-1.5">
                                    <span className="pill bg-amber-50 text-amber-700">Revise</span>
                                    <button onClick={() => updateStatus(t.id, 'done')} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">Mark done</button>
                                  </div>
                                ) : (
                                  <div className="flex gap-1.5">
                                    <button onClick={() => updateStatus(t.id, 'done')}   className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">Done</button>
                                    <button onClick={() => updateStatus(t.id, 'revise')} className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer">Revise</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AddDelegateModal open={delegateOpen} onClose={() => setDelegateOpen(false)} users={users} />
    </div>
  );
}

function Avatar({ name = '' }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '·';
  const palette = [
    'from-rose-400 to-pink-600',
    'from-amber-400 to-orange-600',
    'from-emerald-400 to-teal-600',
    'from-primary-400 to-primary-600',
    'from-violet-400 to-purple-600',
  ];
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const grad = palette[hash % palette.length];
  return <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${grad} text-white grid place-items-center text-[11px] font-bold shrink-0`}>{ini}</div>;
}

function PlusIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
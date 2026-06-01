'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AddDelegateModal from '../components/AddDelegateModal';
import AddMasterModal   from '../components/AddMasterModal';

export default function AllTasksClient({ grouped, users }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [tab, setTab] = useState('Delegation');
  const [statusTab, setStatusTab] = useState('All');
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [delegateOpen,     setDelegateOpen]     = useState(false);
  const [checklistOpen,    setChecklistOpen]    = useState(false);
  const [transferOpen,     setTransferOpen]     = useState(false);
  const [myTransferOpen,   setMyTransferOpen]   = useState(false);
  const [editTask,         setEditTask]         = useState(null);
  const [employeeFilter, setEmployeeFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const isAdmin = session?.user?.roles?.includes('Admin') || session?.user?.roles?.includes('HOD');
  const currentUserName = session?.user?.name;

  const fmt = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // DB mein type lowercase hai ('delegation'), Checklist explicitly 'Checklist' set hai
  const tabType = {
    'Delegation':     'delegation',
    'Checklist':      'Checklist',
    'Delegate by Me': 'delegation',
  };

  const getBaseGroups = (currentTab) =>
    (isAdmin || currentTab === 'Delegate by Me')
      ? grouped
      : grouped.filter((g) => g.doer === currentUserName);

  // Count tasks per tab (only tab filter, no status/date/search) for badge display
  const tabCount = (tabName) => {
    const allTasks = getBaseGroups(tabName).flatMap((g) => g.tasks);
    if (tabName === 'Delegate by Me') {
      return allTasks.filter((t) => (t.type || 'delegation').toLowerCase() === 'delegation' && t.delegatedBy === session?.user?.id).length;
    }
    const wantType = tabType[tabName];
    return wantType ? allTasks.filter((t) => (t.type || 'delegation').toLowerCase() === wantType.toLowerCase()).length : allTasks.length;
  };

  const STATUS_RANK = { revise: 0, revise_requested: 1, pending: 2, done: 3 };

  const filterTasks = (tasks) => {
    let arr = tasks;

    if (tab === 'Delegate by Me') {
      arr = arr.filter((t) => (t.type || 'delegation').toLowerCase() === 'delegation' && t.delegatedBy === session?.user?.id);
    } else {
      const wantType = tabType[tab];
      if (wantType) arr = arr.filter((t) => (t.type || 'delegation').toLowerCase() === wantType.toLowerCase());
    }

    if (statusTab === 'Pending')   arr = arr.filter((t) => t.status === 'pending' || t.status === 'revise');
    if (statusTab === 'Completed') arr = arr.filter((t) => t.status === 'done');

    if (fromDate) arr = arr.filter((t) => t.dueDate && new Date(t.dueDate) >= new Date(fromDate));
    if (toDate)   arr = arr.filter((t) => t.dueDate && new Date(t.dueDate) <= new Date(toDate));

    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter((t) =>
        (t.description || '').toLowerCase().includes(s) ||
        (t.client || '').toLowerCase().includes(s)
      );
    }

    // revise → revise_requested → pending → done
    arr = arr.slice().sort((a, b) => (STATUS_RANK[a.status] ?? 2) - (STATUS_RANK[b.status] ?? 2));

    return arr;
  };

  const visibleGroups = getBaseGroups(tab)
    .filter((g) => employeeFilter === 'All' || g.doer === employeeFilter)
    .map((g) => ({ ...g, tasks: filterTasks(g.tasks) }))
    .filter((g) => g.tasks.length > 0);

  const totalTasks = visibleGroups.reduce((s, g) => s + g.tasks.length, 0);

  function expandAll()   { const o = {}; visibleGroups.forEach((g) => (o[g.doer] = true)); setExpanded(o); }
  function collapseAll() { setExpanded({}); }

  async function updateStatus(id, status, type) {
    if (type === 'Checklist') return;
    await fetch('/api/delegations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    window.location.reload();
  }

  async function markChecklistDone(taskId) {
    await fetch('/api/checklist-completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterId: taskId }),
    });
    window.location.reload();
  }

  async function deleteTask(id, type) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    if (type === 'Checklist') {
      await fetch('/api/masters?id=' + id, { method: 'DELETE' });
    } else {
      await fetch('/api/delegations?id=' + id, { method: 'DELETE' });
    }
    window.location.reload();
  }

  const getUserName = (id) => users.find((u) => u.id === id)?.name || id || '—';

  // Global serial index counter across all groups
  let globalSerial = 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
{isAdmin ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setTransferOpen(true)} className="btn-secondary">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 3 4 4-4 4"/><path d="M21 7H4"/><path d="m7 21-4-4 4-4"/><path d="M3 17h17"/></svg>
              Transfer
            </button>
            <button onClick={() => setChecklistOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition shadow-sm">
              <PlusIcon /> Checklist
            </button>
            <button onClick={() => setDelegateOpen(true)} className="btn-primary">
              <PlusIcon /> Delegate Task
            </button>
          </div>
        ) : (
          <button onClick={() => setMyTransferOpen(true)} className="btn-secondary">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 3 4 4-4 4"/><path d="M21 7H4"/><path d="m7 21-4-4 4-4"/><path d="M3 17h17"/></svg>
            Transfer My Tasks
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="card p-3 flex items-center gap-2 flex-wrap">
        {/* Tab buttons with count badges */}
        <div className="seg">
          {['Delegation', 'Checklist', 'Delegate by Me'].map((t) => {
            const count = tabCount(t);
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`seg-btn flex items-center gap-1.5 ${tab === t ? 'seg-btn-active' : ''}`}
              >
                {t}
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${
                  tab === t ? 'bg-white/30 text-current' : 'bg-slate-200 text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        {isAdmin && (
          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="input !w-auto !py-1.5">
            <option value="All">All Employees</option>
            {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        )}
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input !w-auto !py-1.5" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input !w-auto !py-1.5" />
        {(fromDate || toDate || employeeFilter !== 'All') && (
          <button
            onClick={() => { setFromDate(''); setToDate(''); setEmployeeFilter('All'); }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 transition"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            Clear
          </button>
        )}
        <div className="flex-1" />
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description, client…" className="input pl-9 w-64" />
        </div>
      </div>

      {/* Status tabs + summary + expand controls */}
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
          <button onClick={expandAll}   className="btn-ghost !py-1 !px-2">Expand all</button>
          <button onClick={collapseAll} className="btn-ghost !py-1 !px-2">Collapse all</button>
        </div>
      </div>

      {/* Task groups */}
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
            {visibleGroups.map((g, groupIdx) => {
              const pendingCount   = g.tasks.filter((t) => t.status === 'pending').length;
              const completedCount = g.tasks.filter((t) => t.status === 'done').length;
              const revisedCount   = g.tasks.filter((t) => t.status === 'revise').length;
              const isOpen = expanded[g.doer];

              // Track start index for this group before rendering
              const groupStartSerial = globalSerial + 1;

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
                      {/* Group index */}
                      <span className="text-xs font-mono text-slate-400 w-5 text-right shrink-0">{groupIdx + 1}.</span>
                      <Avatar name={g.doer} />
                      <span className="font-medium text-slate-800 text-sm">{g.doer}</span>
                      <span className="text-xs text-slate-400">({g.tasks.length} task{g.tasks.length === 1 ? '' : 's'} · #{groupStartSerial}–#{groupStartSerial + g.tasks.length - 1})</span>
                    </span>
                    <div className="flex gap-1.5 items-center">
                      {completedCount > 0 && <span className="pill bg-emerald-50 text-emerald-700">{completedCount} done</span>}
                      {pendingCount   > 0 && <span className="pill bg-red-50 text-red-700">{pendingCount} pending</span>}
                      {revisedCount   > 0 && <span className="pill bg-amber-50 text-amber-700">{revisedCount} revised</span>}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="table-th">Action</th>
                            <th className="table-th">Desc</th>
                            <th className="table-th">Doer</th>
                            <th className="table-th">Assignee</th>
                            <th className="table-th">Date</th>
                            <th className="table-th">Remarks</th>
                            <th className="table-th">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.tasks.map((t) => {
                            globalSerial += 1;
                            return (
                              <tr key={t.id} className="table-row">
                                {/* ACTION */}
                                <td className="table-td">
                                  <div className="flex items-center gap-1">
                                    {t.type !== 'Checklist' && (
                                      <button title="Edit" onClick={() => setEditTask(t)}
                                        className="w-7 h-7 rounded-lg grid place-items-center text-amber-500 hover:bg-amber-50 transition">
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>
                                    )}
                                    <button title="Delete" onClick={() => deleteTask(t.id, t.type)}
                                      className="w-7 h-7 rounded-lg grid place-items-center text-red-500 hover:bg-red-50 transition">
                                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                    </button>
                                    {t.type !== 'Checklist' && t.status !== 'done' && (
                                      <>
                                        <button title="Mark Done" onClick={() => updateStatus(t.id, 'done', t.type)}
                                          className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer text-[11px]">Done</button>
                                        {t.status !== 'revise' && (
                                          <button title="Revise" onClick={() => updateStatus(t.id, 'revise', t.type)}
                                            className="pill bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer text-[11px]">Revise</button>
                                        )}
                                      </>
                                    )}
                                    {t.type === 'Checklist' && t.status !== 'done' && (
                                      <button onClick={() => markChecklistDone(t.id)}
                                        className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer text-[11px]">Done</button>
                                    )}
                                  </div>
                                </td>
                                {/* DESC */}
                                <td className="table-td max-w-[280px]">
                                  <div className="flex items-start gap-1">
                                    <span className="text-slate-800 font-medium">{t.description}</span>
                                    {t.url && (
                                      <a href={t.url} target="_blank" rel="noopener noreferrer"
                                        className="shrink-0 text-primary-500 hover:text-primary-700 mt-0.5">
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                      </a>
                                    )}
                                  </div>
                                  {t.transferredFrom && (
                                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium border border-amber-100 mt-0.5">
                                      🔄 from {t.transferredFrom}
                                    </span>
                                  )}
                                </td>
                                {/* DOER */}
                                <td className="table-td text-slate-700 whitespace-nowrap">{t.doer || '—'}</td>
                                {/* ASSIGNEE */}
                                <td className="table-td text-slate-600 whitespace-nowrap">{getUserName(t.delegatedBy)}</td>
                                {/* DATE */}
                                <td className="table-td text-slate-600 whitespace-nowrap text-xs">
                                  {t.type === 'Checklist' ? (t.frequency || 'Recurring') : fmt(t.dueDate)}
                                </td>
                                {/* REMARKS */}
                                <td className="table-td text-slate-500 max-w-[160px] text-xs">{t.remarks || '—'}</td>
                                {/* STATUS */}
                                <td className="table-td">
                                  <span className={`pill text-[11px] ${
                                    t.status === 'done'             ? 'bg-emerald-50 text-emerald-700' :
                                    t.status === 'revise'           ? 'bg-amber-50 text-amber-700' :
                                    t.status === 'revise_requested' ? 'bg-orange-50 text-orange-700' :
                                    'bg-red-50 text-red-600'
                                  }`}>
                                    {t.status === 'done' ? 'Done' :
                                     t.status === 'revise' ? 'Revise' :
                                     t.status === 'revise_requested' ? 'Revise Req.' : 'Pending'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
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

      <AddDelegateModal open={delegateOpen}   onClose={() => setDelegateOpen(false)}  users={users} />
      <AddMasterModal   open={checklistOpen}  onClose={() => setChecklistOpen(false)} users={users} />
      {editTask && (
        <EditTaskModal
          task={editTask}
          users={users}
          onClose={() => setEditTask(null)}
          onSaved={() => { setEditTask(null); window.location.reload(); }}
        />
      )}
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} users={users} grouped={grouped} onDone={() => { setTransferOpen(false); window.location.reload(); }} />
      <MyTransferModal open={myTransferOpen} onClose={() => setMyTransferOpen(false)} users={users} grouped={grouped} fromName={currentUserName} onDone={() => { setMyTransferOpen(false); window.location.reload(); }} />
    </div>
  );
}

function Avatar({ name = '' }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '·';
  const palette = ['from-rose-400 to-pink-600','from-amber-400 to-orange-600','from-emerald-400 to-teal-600','from-primary-400 to-primary-600','from-violet-400 to-purple-600'];
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const grad = palette[hash % palette.length];
  return <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${grad} text-white grid place-items-center text-[11px] font-bold shrink-0`}>{ini}</div>;
}

function PlusIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }

function EditTaskModal({ task, users, onClose, onSaved }) {
  const [form, setForm] = useState({
    description: task.description || '',
    doerId:      task.doerId      || '',
    dueDate:     task.dueDate     || '',
    priority:    task.priority    || 'Low',
    client:      task.client      || '',
    remarks:     task.remarks     || '',
    url:         task.url         || '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.description.trim()) { alert('Description required'); return; }
    setSaving(true);
    const selectedUser = users.find((u) => u.id === form.doerId);
    const res = await fetch('/api/delegations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:          task.id,
        description: form.description,
        dueDate:     form.dueDate   || undefined,
        priority:    form.priority,
        client:      form.client,
        remarks:     form.remarks,
        url:         form.url,
        ...(selectedUser ? { doer: selectedUser.name, doerId: selectedUser.id } : {}),
      }),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to save'); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-slate-900">Edit Task</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {/* Body */}
        <div className="px-6 py-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="label">Description *</label>
            <textarea rows={3} className="input resize-none" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Doer</label>
              <select className="input" value={form.doerId} onChange={(e) => setForm({ ...form, doerId: e.target.value })}>
                <option value="">— Select —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Due Date</label>
              <input type="date" className="input" value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option>Low</option><option>Medium</option><option>High</option>
              </select>
            </div>
            <div>
              <label className="label">Client</label>
              <input className="input" value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="Client name" />
            </div>
          </div>
          <div>
            <label className="label">URL <span className="text-slate-400 font-normal">(optional)</span></label>
            <input className="input" value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <label className="label">Remarks</label>
            <textarea rows={2} className="input resize-none" value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Any remarks..." />
          </div>
        </div>
        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

function TransferModal({ open, onClose, users, grouped, onDone }) {
  const [fromUser,     setFromUser]     = useState('');
  const [toUser,       setToUser]       = useState('');
  const [selectedIds,  setSelectedIds]  = useState(new Set());
  const [loading,      setLoading]      = useState(false);
  const [msg,          setMsg]          = useState('');

  const fromTasks = useMemo(() => {
    if (!fromUser) return [];
    const from = users.find((u) => u.id === fromUser);
    if (!from) return [];
    const group = grouped.find((g) => g.doer === from.name);
    return (group?.tasks || []).filter((t) => t.type !== 'Checklist' && t.status !== 'done');
  }, [fromUser, users, grouped]);

  useEffect(() => {
    setSelectedIds(new Set(fromTasks.map((t) => t.id)));
  }, [fromTasks]);

  if (!open) return null;

  function toggleTask(id) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  }

  function toggleAll() {
    setSelectedIds(selectedIds.size === fromTasks.length
      ? new Set()
      : new Set(fromTasks.map((t) => t.id)));
  }

  async function handleTransfer() {
    if (!fromUser || !toUser) return setMsg('Please select both users');
    if (fromUser === toUser)  return setMsg('From and To cannot be the same');
    if (selectedIds.size === 0) return setMsg('Select at least one task');
    setLoading(true); setMsg('');
    const to   = users.find((u) => u.id === toUser);
    const from = users.find((u) => u.id === fromUser);
    const res  = await fetch('/api/delegations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'transfer',
        fromDoer: from?.name, toDoer: to?.name, toDoerId: to?.id,
        taskIds: [...selectedIds],
      }),
    });
    setLoading(false);
    if (res.ok) { onDone(); }
    else { const d = await res.json(); setMsg(d.error || 'Transfer failed'); }
  }

  const allSelected = fromTasks.length > 0 && selectedIds.size === fromTasks.length;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <svg className="w-4 h-4 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 3 4 4-4 4"/><path d="M21 7H4"/><path d="m7 21-4-4 4-4"/><path d="M3 17h17"/></svg>
            Transfer Tasks
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-slate-100 grid place-items-center text-slate-400">✕</button>
        </div>

        {/* User selectors */}
        <div className="px-6 py-4 grid grid-cols-2 gap-3 shrink-0 border-b border-slate-100">
          <div>
            <label className="label">From (whose tasks)</label>
            <select value={fromUser} onChange={(e) => { setFromUser(e.target.value); setToUser(''); }} className="input">
              <option value="">— Select employee —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Transfer To</label>
            <select value={toUser} onChange={(e) => setToUser(e.target.value)} className="input" disabled={!fromUser}>
              <option value="">— Select employee —</option>
              {users.filter((u) => u.id !== fromUser).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto">
          {!fromUser ? (
            <div className="p-8 text-center text-sm text-slate-400">Select an employee to see their tasks</div>
          ) : fromTasks.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No pending tasks for this employee</div>
          ) : (
            <>
              {/* Select all row */}
              <div className="px-4 py-2 flex items-center gap-2.5 border-b border-slate-100 bg-slate-50">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="w-4 h-4 rounded accent-primary-600 cursor-pointer" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {allSelected ? 'Deselect All' : 'Select All'} ({fromTasks.length} tasks)
                </span>
                {selectedIds.size > 0 && (
                  <span className="ml-auto text-xs font-semibold text-primary-600">{selectedIds.size} selected</span>
                )}
              </div>

              {/* Task rows */}
              {fromTasks.map((t) => (
                <label key={t.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleTask(t.id)}
                    className="w-4 h-4 rounded accent-primary-600 mt-0.5 shrink-0 cursor-pointer" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-slate-700 leading-snug truncate">{t.description}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.dueDate && <span className="text-[10.5px] text-slate-400">{new Date(t.dueDate).toLocaleDateString('en-IN')}</span>}
                      {t.client  && <span className="text-[10.5px] text-slate-400">· {t.client}</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        t.status === 'revise' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
                      }`}>{t.status}</span>
                    </div>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0">
          {msg && <p className="text-sm text-red-500 mb-2">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              onClick={handleTransfer}
              disabled={loading || !fromUser || !toUser || selectedIds.size === 0}
              className="btn-primary"
            >
              {loading ? 'Transferring…' : `Transfer${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MyTransferModal({ open, onClose, users, fromName, grouped, onDone }) {
  const [toUser,      setToUser]      = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState('');

  const myTasks = useMemo(() => {
    const group = grouped.find((g) => g.doer === fromName);
    return (group?.tasks || []).filter((t) => t.type !== 'Checklist' && t.status !== 'done');
  }, [grouped, fromName]);

  useEffect(() => {
    if (open) setSelectedIds(new Set(myTasks.map((t) => t.id)));
  }, [open, myTasks]);

  if (!open) return null;

  function toggleTask(id) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  }

  function toggleAll() {
    setSelectedIds(selectedIds.size === myTasks.length
      ? new Set()
      : new Set(myTasks.map((t) => t.id)));
  }

  async function handleTransfer() {
    if (!toUser) return setMsg('Please select a person to transfer to.');
    if (selectedIds.size === 0) return setMsg('Select at least one task.');
    setLoading(true); setMsg('');
    const to = users.find((u) => u.id === toUser);
    const res = await fetch('/api/delegations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'transfer',
        fromDoer: fromName, toDoer: to?.name, toDoerId: to?.id,
        taskIds: [...selectedIds],
      }),
    });
    setLoading(false);
    if (res.ok) { onDone(); }
    else { const d = await res.json(); setMsg(d.error || 'Transfer failed'); }
  }

  const allSelected = myTasks.length > 0 && selectedIds.size === myTasks.length;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <svg className="w-4 h-4 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 3 4 4-4 4"/><path d="M21 7H4"/><path d="m7 21-4-4 4-4"/><path d="M3 17h17"/></svg>
            Transfer My Tasks
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-slate-100 grid place-items-center text-slate-400">✕</button>
        </div>

        {/* To selector */}
        <div className="px-6 py-4 shrink-0 border-b border-slate-100">
          <label className="label">Transfer To</label>
          <select value={toUser} onChange={(e) => setToUser(e.target.value)} className="input">
            <option value="">— Select employee —</option>
            {users.filter((u) => u.name !== fromName).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto">
          {myTasks.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No pending tasks to transfer</div>
          ) : (
            <>
              <div className="px-4 py-2 flex items-center gap-2.5 border-b border-slate-100 bg-slate-50">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="w-4 h-4 rounded accent-primary-600 cursor-pointer" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {allSelected ? 'Deselect All' : 'Select All'} ({myTasks.length})
                </span>
                {selectedIds.size > 0 && (
                  <span className="ml-auto text-xs font-semibold text-primary-600">{selectedIds.size} selected</span>
                )}
              </div>
              {myTasks.map((t) => (
                <label key={t.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleTask(t.id)}
                    className="w-4 h-4 rounded accent-primary-600 mt-0.5 shrink-0 cursor-pointer" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-slate-700 leading-snug truncate">{t.description}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.dueDate && <span className="text-[10.5px] text-slate-400">{new Date(t.dueDate).toLocaleDateString('en-IN')}</span>}
                      {t.client  && <span className="text-[10.5px] text-slate-400">· {t.client}</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        t.status === 'revise' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
                      }`}>{t.status}</span>
                    </div>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0">
          {msg && <p className="text-sm text-red-500 mb-2">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={handleTransfer} disabled={loading || !toUser || selectedIds.size === 0} className="btn-primary">
              {loading ? 'Transferring…' : `Transfer${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AddDelegateModal from '../components/AddDelegateModal';
import AddMasterModal   from '../components/AddMasterModal';
import { useConfirmToast } from '../components/ConfirmToast';

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
  const [reviseTask,       setReviseTask]       = useState(null);
  const [reviseNote,       setReviseNote]       = useState('');
  const [reviseDate,       setReviseDate]       = useState('');
  const [reviseSaving,     setReviseSaving]     = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState('All');
  const todayISO = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fileTask,         setFileTask]         = useState(null);
  const [completionInput,  setCompletionInput]  = useState(null);
  const [fileUploading,    setFileUploading]    = useState(false);

  const isAdmin = session?.user?.roles?.includes('Admin') || session?.user?.roles?.includes('HOD');
  const currentUserName = session?.user?.name;
  const { ask, ConfirmUI } = useConfirmToast();

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

  function fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  async function submitCompletionFile() {
    if (!fileTask || !completionInput) return;
    setFileUploading(true);
    try {
      const dataUrl = await fileToDataUrl(completionInput);
      if (fileTask.type === 'Checklist') {
        await fetch('/api/checklist-completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ masterId: fileTask.id, file: dataUrl }),
        });
      } else {
        await fetch('/api/delegations', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: fileTask.id, status: 'done', completionFile: dataUrl }),
        });
      }
      setFileTask(null); setCompletionInput(null);
      window.location.reload();
    } catch { setFileUploading(false); }
  }

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

  async function undoTask(task) {
    if (task.type === 'Checklist') {
      await fetch('/api/checklist-completions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterId: task.id }),
      });
    } else {
      await fetch('/api/delegations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: 'pending' }),
      });
    }
    window.location.reload();
  }

  async function confirmRevise() {
    if (!reviseTask) return;
    if (!reviseDate) { alert('Please pick a "revise until" date.'); return; }
    if (!reviseNote.trim()) { alert('Revise note is required.'); return; }
    setReviseSaving(true);
    try {
      await fetch('/api/delegations', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reviseTask.id,
          status: 'revise',
          remarks: reviseNote,
          dueDate: reviseDate,
        }),
      });
      setReviseTask(null); setReviseNote(''); setReviseDate('');
      window.location.reload();
    } finally { setReviseSaving(false); }
  }

  function deleteTask(id, type) {
    ask('Delete this task?', async () => {
      if (type === 'Checklist') {
        await fetch('/api/masters?id=' + id, { method: 'DELETE' });
      } else {
        await fetch('/api/delegations?id=' + id, { method: 'DELETE' });
      }
      window.location.reload();
    });
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
                                        <button title="Mark Done"
                                          onClick={() => t.requireFile ? (setCompletionInput(null), setFileTask(t)) : updateStatus(t.id, 'done', t.type)}
                                          className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer text-[11px]">Done</button>
                                        {t.status !== 'revise' && (
                                          <button title="Revise" onClick={() => { setReviseNote(''); setReviseDate(''); setReviseTask(t); }}
                                            className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer text-[11px]">Revise</button>
                                        )}
                                      </>
                                    )}
                                    {t.type === 'Checklist' && t.status !== 'done' && (
                                      <button
                                        onClick={() => t.requireFile ? (setCompletionInput(null), setFileTask(t)) : markChecklistDone(t.id)}
                                        className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer text-[11px]">Done</button>
                                    )}
                                    {t.status === 'done' && (
                                      <button title="Undo Done" onClick={() => undoTask(t)}
                                        className="pill bg-slate-100 text-slate-600 hover:bg-orange-50 hover:text-orange-600 cursor-pointer text-[11px]">↩ Undo</button>
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
                                    {t.image && (
                                      <a href={t.image} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-0.5" title="View photo">
                                        <img src={t.image} alt="" className="w-6 h-6 rounded object-cover border border-slate-200" />
                                      </a>
                                    )}
                                    {t.attachment && (
                                      <a href={t.attachment} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-0.5 text-blue-500 hover:text-blue-700" title="View attachment">
                                        {t.attachment.startsWith('data:image') ? <img src={t.attachment} alt="" className="w-6 h-6 rounded object-cover border border-slate-200" /> : <span>📄</span>}
                                      </a>
                                    )}
                                    {!!t.requireFile && t.status !== 'done' && (
                                      <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 rounded px-1 shrink-0">📎 File req.</span>
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
                                  {fmt(t.dueDate)}
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
          onSaved={() => { setEditTask(null); router.refresh(); }}
        />
      )}
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} users={users} grouped={grouped} onDone={() => { setTransferOpen(false); window.location.reload(); }} />
      <MyTransferModal open={myTransferOpen} onClose={() => setMyTransferOpen(false)} users={users} grouped={grouped} fromName={currentUserName} onDone={() => { setMyTransferOpen(false); window.location.reload(); }} />

      {ConfirmUI}

      {/* File Upload Modal — shown when task requires proof before marking done */}
      {fileTask && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !fileUploading && (setFileTask(null), setCompletionInput(null))}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 grid place-items-center shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Upload Proof of Completion</h3>
                <p className="text-[12px] text-slate-500 mt-0.5">A file is required to mark this task as done</p>
              </div>
            </div>
            <p className="text-[12px] text-slate-600 bg-slate-50 rounded-lg p-3 mb-4 line-clamp-2">{fileTask.description}</p>
            <label className="block cursor-pointer border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-violet-300 hover:bg-violet-50 transition mb-4">
              {completionInput
                ? <span className="text-sm font-medium text-slate-700">📎 {completionInput.name}</span>
                : <><span className="text-2xl block mb-1">⬆</span><span className="text-sm text-slate-500">Click to choose Photo or PDF</span></>}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setCompletionInput(e.target.files?.[0] || null)} />
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setFileTask(null); setCompletionInput(null); }} disabled={fileUploading} className="btn-secondary">Cancel</button>
              <button onClick={submitCompletionFile} disabled={fileUploading || !completionInput} className="btn-primary">
                {fileUploading ? 'Uploading…' : 'Submit & Mark Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revise Modal */}
      {reviseTask && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !reviseSaving && setReviseTask(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 grid place-items-center shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/></svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900">Request Revision</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">Send this task back for revision</p>
              </div>
              <button onClick={() => setReviseTask(null)} disabled={reviseSaving} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm">
                <div className="font-medium text-slate-800">{reviseTask.description}</div>
                <div className="text-xs text-slate-500 mt-0.5">Doer: <b>{reviseTask.doer}</b></div>
              </div>
              <div>
                <label className="label">Revise until <span className="text-red-500">*</span></label>
                <input type="date" className="input" min={todayISO} value={reviseDate} onChange={e => setReviseDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Revise note <span className="text-red-500">*</span></label>
                <textarea rows={3} className="input resize-none" placeholder="What needs to be corrected?" value={reviseNote} onChange={e => setReviseNote(e.target.value)} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setReviseTask(null)} disabled={reviseSaving} className="btn-secondary">Cancel</button>
              <button onClick={confirmRevise} disabled={reviseSaving} className="btn-danger">{reviseSaving ? 'Saving…' : 'Confirm Revise'}</button>
            </div>
          </div>
        </div>
      )}
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
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)',
        animation: 'etm-fadeIn .2s ease',
      }}
    >
      <style>{`
        @keyframes etm-fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes etm-slideUp { from { opacity:0; transform:translateY(18px) scale(.98) } to { opacity:1; transform:translateY(0) scale(1) } }
        .etm-scroll::-webkit-scrollbar { width:4px }
        .etm-scroll::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:99px }
        .etm-scroll::-webkit-scrollbar-track { background:transparent }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)',
          animation: 'etm-slideUp .25s cubic-bezier(.16,1,.3,1)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px 12px',
          borderBottom: '1px solid #f1f5f9',
          background: 'linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)',
          borderRadius: '20px 20px 0 0',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg,#f59e0b,#d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(245,158,11,0.35)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>Edit Task</div>
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 1 }}>Update task details</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(245,158,11,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="etm-scroll" style={{ padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="label">Description <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea rows={3} className="input resize-none" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            <label className="label">
              URL&nbsp;<span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(optional)</span>
            </label>
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
        <div style={{
          padding: '10px 18px', borderTop: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          borderRadius: '0 0 20px 20px', background: '#fafafa',
        }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, borderRadius: 10, border: '1.5px solid #e2e8f0', cursor: 'pointer', background: '#fff', color: '#475569' }}
          >Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '8px 22px', fontSize: 13, fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: saving ? '#fcd34d' : 'linear-gradient(135deg,#f59e0b,#d97706)',
              color: '#fff', opacity: saving ? 0.7 : 1,
              boxShadow: saving ? 'none' : '0 4px 14px rgba(245,158,11,0.4)',
              transition: 'all .15s',
            }}
          >{saving ? 'Saving…' : '✓ Save Changes'}</button>
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

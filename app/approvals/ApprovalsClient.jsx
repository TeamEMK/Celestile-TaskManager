'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConfirmToast } from '../components/ConfirmToast';
import Icon from '../components/Icon';
import { fmt, ReviseIcon, TaskIcon, SentIcon, PriorityPill, TaskAttachments, DoerCell, RowActions } from './shared';


// The "seen" sets are a UI nicety (they dim the new-request highlight), stored
// per browser. They only ever grew: ids of long-deleted tasks stayed in
// localStorage forever, and on a busy install the entry creeps towards the
// 5MB quota until setItem starts throwing. Keep the newest N and drop the rest
// — an id that has aged out simply shows as new once, which is harmless.
const SEEN_LIMIT = 500;

function loadSeen(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function saveSeen(key, set) {
  try {
    const list = [...set];
    localStorage.setItem(key, JSON.stringify(list.slice(-SEEN_LIMIT)));
  } catch {}
}

// Declared at module scope, not inside the component. A component defined in
// the render body is a NEW type on every render, so React unmounts and
// remounts its whole subtree each time instead of updating it.
function EmptyState({ icon: Icon, label }) {
  return (
    <div className="p-14 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
        <Icon className="w-7 h-7 text-primary-400" />
      </div>
      <div className="text-[13.5px] font-semibold text-slate-700">No pending {label.toLowerCase()}</div>
      <div className="text-[12px] text-slate-500 mt-0.5">Requests will appear here when submitted.</div>
    </div>
  );
}

export default function ApprovalsClient({ reviseRequests = [], taskApprovals = [], myTaskApprovals = [] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'task' ? 'Task Approvals' : 'Revise Requests');

  const [seenRevise,    setSeenRevise]    = useState(() => new Set());
  const [seenApprovals, setSeenApprovals] = useState(() => new Set());
  const [grantTask,     setGrantTask]     = useState(null);
  const [granting,      setGranting]      = useState(false);
  const timer = useRef(null);
  const { ask, ConfirmUI } = useConfirmToast();

  // Load from localStorage only on client to avoid SSR hydration mismatch
  useEffect(() => {
    setSeenRevise(loadSeen('seen_revise_ids'));
    setSeenApprovals(loadSeen('seen_approval_ids'));
  }, []);

  // Auto-mark as seen after 6 seconds of viewing.
  //
  // The set updates go through the functional form of the setter. Reading
  // `seenRevise` from the closure meant the effect captured whatever the value
  // was when it last ran, and its deps deliberately excluded that value (the
  // eslint rule was disabled) — so a refresh landing mid-timer folded the new
  // ids into a stale snapshot and quietly dropped everything marked seen since.
  // The functional form always starts from current state, which is also why the
  // deps list no longer needs the exception.
  useEffect(() => {
    clearTimeout(timer.current);
    const reviseIds = reviseRequests.map((r) => r.id);
    const approvalIds = taskApprovals.map((r) => r.id);
    timer.current = setTimeout(() => {
      if (tab === 'Revise Requests') {
        setSeenRevise((prev) => {
          const updated = new Set([...prev, ...reviseIds]);
          saveSeen('seen_revise_ids', updated);
          return updated;
        });
      } else if (tab === 'Task Approvals') {
        setSeenApprovals((prev) => {
          const updated = new Set([...prev, ...approvalIds]);
          saveSeen('seen_approval_ids', updated);
          return updated;
        });
      }
    }, 6000);
    return () => clearTimeout(timer.current);
  }, [tab, reviseRequests, taskApprovals]);

  const TABS = [
    { key: 'Revise Requests', count: reviseRequests.length,  icon: ReviseIcon },
    { key: 'Task Approvals',  count: taskApprovals.length,   icon: TaskIcon   },
    { key: 'My Submitted',    count: myTaskApprovals.length, icon: SentIcon   },
  ];

  async function confirmGrant() {
    if (!grantTask) return;
    setGranting(true);
    await fetch('/api/delegations', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: grantTask.id, status: 'revise', _grantRevise: true }),
    });
    setGrantTask(null); setGranting(false);
    router.refresh();
  }

  function denyRevise(task) {
    ask('Deny this revise request?', async () => {
      await fetch('/api/delegations', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: 'pending', _denyRevise: true }),
      });
      router.refresh();
    });
  }

  function approveTask(task) {
    ask('Approve this task as done?', async () => {
      await fetch('/api/delegations', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: 'done', _approverAction: 'approve' }),
      });
      router.refresh();
    });
  }

  function rejectTask(task) {
    ask('Reject and send back to the doer for revision?', async () => {
      await fetch('/api/delegations', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: 'revise', _approverAction: 'reject' }),
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="seg">
        {TABS.map(({ key, count, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`seg-btn flex items-center gap-1.5 ${tab === key ? 'seg-btn-active' : ''}`}>
            <Icon className={`w-3.5 h-3.5 ${tab === key ? 'text-primary-600' : 'text-slate-400'}`} />
            {key}
            <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${count > 0 ? 'bg-red-100 text-red-600' : tab === key ? 'bg-primary-50 text-primary-700' : 'bg-slate-200 text-slate-600'}`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Revise Requests */}
      {tab === 'Revise Requests' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-slate-50/60">
            <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center"><ReviseIcon className="w-4 h-4" /></div>
            <div>
              <h2 className="text-[13.5px] font-semibold text-slate-900">Revise Requests</h2>
              <p className="text-[11.5px] text-slate-500">{reviseRequests.length} awaiting decision</p>
            </div>
          </div>
          {reviseRequests.length === 0 ? <EmptyState icon={ReviseIcon} label="Revise Requests" /> : (
            <div className="overflow-x-auto max-h-[calc(100vh-260px)] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                  <tr>
                    <th className="table-th">#</th>
                    <th className="table-th">Task</th>
                    <th className="table-th">Doer</th>
                    <th className="table-th">Requested On</th>
                    <th className="table-th">Revise Until</th>
                    <th className="table-th">Remarks</th>
                    <th className="table-th text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reviseRequests.map((t, i) => {
                    const unseen = !seenRevise.has(t.id);
                    return (
                      <tr key={t.id} className="table-row" style={unseen ? { background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid #f59e0b' } : {}}>
                        <td className="table-td text-slate-400 text-xs font-mono">{i + 1}</td>
                        <td className="table-td max-w-[240px] truncate">
                          <span className={unseen ? 'font-semibold text-amber-800' : 'font-medium text-slate-800'}>{t.description}</span>
                          {unseen && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400 text-black">NEW</span>}
                        </td>
                        <td className="table-td">
                          <DoerCell name={t.doer} />
                        </td>
                        <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.createdAt)}</td>
                        <td className="table-td whitespace-nowrap">
                          {t.dueDate
                            ? <span className="font-medium text-red-600">{fmt(t.dueDate)}</span>
                            : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="table-td text-slate-500">{t.remarks || '—'}</td>
                        <td className="table-td">
                          <RowActions onYes={() => setGrantTask(t)} onNo={() => denyRevise(t)} yesLabel="Grant" noLabel="Deny" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Task Approvals */}
      {tab === 'Task Approvals' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-slate-50/60">
            <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center"><TaskIcon className="w-4 h-4" /></div>
            <div>
              <h2 className="text-[13.5px] font-semibold text-slate-900">Task Approvals</h2>
              <p className="text-[11.5px] text-slate-500">{taskApprovals.length} awaiting your decision</p>
            </div>
          </div>
          {taskApprovals.length === 0 ? <EmptyState icon={TaskIcon} label="Task Approvals" /> : (
            <div className="overflow-x-auto max-h-[calc(100vh-260px)] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                  <tr>
                    <th className="table-th">#</th>
                    <th className="table-th">Task</th>
                    <th className="table-th">Assigned To</th>
                    <th className="table-th">Client</th>
                    <th className="table-th">Due Date</th>
                    <th className="table-th">Priority</th>
                    <th className="table-th text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {taskApprovals.map((t, i) => {
                    const unseen = !seenApprovals.has(t.id);
                    return (
                    <tr key={t.id} className="table-row" style={unseen ? { background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid #f59e0b' } : {}}>
                      <td className="table-td text-slate-400 text-xs font-mono">{i + 1}</td>
                      <td className="table-td max-w-[220px]">
                        <div className="flex items-start gap-1.5">
                          <span className={`truncate ${unseen ? 'font-semibold text-amber-800' : 'font-medium text-slate-800'}`}>{t.description}</span>
                          {unseen && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400 text-black">NEW</span>}
                        </div>
                        <TaskAttachments task={t} />
                      </td>
                      <td className="table-td">
                        <DoerCell name={t.doer} />
                      </td>
                      <td className="table-td text-slate-500">{t.client || '—'}</td>
                      <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.dueDate)}</td>
                      <td className="table-td">
                        <PriorityPill priority={t.priority} />
                      </td>
                      <td className="table-td">
                        <RowActions onYes={() => approveTask(t)} onNo={() => rejectTask(t)} yesLabel="Approve" noLabel="Reject" />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* My Submitted — my own tasks currently waiting on someone else's approval */}
      {tab === 'My Submitted' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-slate-50/60">
            <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 grid place-items-center"><SentIcon className="w-4 h-4" /></div>
            <div>
              <h2 className="text-[13.5px] font-semibold text-slate-900">My Submitted</h2>
              <p className="text-[11.5px] text-slate-500">{myTaskApprovals.length} of your tasks awaiting someone else's approval</p>
            </div>
          </div>
          {myTaskApprovals.length === 0 ? <EmptyState icon={SentIcon} label="Submitted Tasks" /> : (
            <div className="overflow-x-auto max-h-[calc(100vh-260px)] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                  <tr>
                    <th className="table-th">#</th>
                    <th className="table-th">Task</th>
                    <th className="table-th">Approver</th>
                    <th className="table-th">Due Date</th>
                    <th className="table-th">Priority</th>
                    <th className="table-th text-right pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {myTaskApprovals.map((t, i) => (
                    <tr key={t.id} className="table-row">
                      <td className="table-td text-slate-400 text-xs font-mono">{i + 1}</td>
                      <td className="table-td max-w-[260px] font-medium text-slate-800 truncate">{t.description}</td>
                      <td className="table-td">
                        <DoerCell name={t.approver || '—'} />
                      </td>
                      <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.dueDate)}</td>
                      <td className="table-td">
                        <PriorityPill priority={t.priority} />
                      </td>
                      <td className="table-td text-right pr-2">
                        <span className="pill bg-violet-50 text-violet-700"><Icon name="clock" className="w-3 h-3" /> Awaiting Approval</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {ConfirmUI}

      {/* Grant Revise Popup */}
      {grantTask && (
        <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4"
          onClick={() => !granting && setGrantTask(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/></svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold">Grant Revise Request</h2>
                <p className="text-xs text-slate-500 mt-0.5">Approve this revision request and send task back?</p>
              </div>
              <button onClick={() => setGrantTask(null)} disabled={granting} className="btn-ghost w-8 h-8 !p-0 shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-2">
                <div className="font-medium text-slate-800">{grantTask.description}</div>
                <div className="text-xs text-slate-500">Doer: <b>{grantTask.doer}</b></div>
                {grantTask.dueDate && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 pt-2 border-t border-slate-200">
                    <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    <span className="text-slate-400">Revise Until:</span>
                    <b className="text-primary-600">{fmt(grantTask.dueDate)}</b>
                  </div>
                )}
                <div className="text-xs text-slate-600 pt-2 border-t border-slate-200">
                  <span className="text-slate-400">Revise Note:</span>{' '}
                  <span className="font-medium">{grantTask.remarks || '—'}</span>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setGrantTask(null)} disabled={granting} className="btn-secondary">Cancel</button>
              <button onClick={confirmGrant} disabled={granting} className="btn-success">
                {granting ? 'Granting…' : 'Grant Revise'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



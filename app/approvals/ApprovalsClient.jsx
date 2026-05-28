'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function ApprovalsClient({ reviseRequests = [], taskApprovals = [] }) {
  const router = useRouter();
  const [tab, setTab] = useState('Revise Requests');

  const TABS = [
    { key: 'Revise Requests', count: reviseRequests.length, icon: ReviseIcon },
    { key: 'Task Approvals',  count: taskApprovals.length,  icon: TaskIcon   },
  ];

  async function grantRevise(task) {
    await fetch('/api/delegations', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: 'revise' }),
    });
    router.refresh();
  }

  async function denyRevise(task) {
    if (!confirm('Deny karna chahte ho?')) return;
    await fetch('/api/delegations', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: 'pending', _denyRevise: true }),
    });
    router.refresh();
  }

  async function approveTask(task) {
    await fetch('/api/delegations', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: 'pending', approval: 'Approved' }),
    });
    router.refresh();
  }

  async function rejectTask(task) {
    if (!confirm('Reject karna chahte ho?')) return;
    await fetch('/api/delegations', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: 'revise' }),
    });
    router.refresh();
  }

  function EmptyState({ icon: Icon, label }) {
    return (
      <div className="card p-14 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-4">
          <Icon className="w-8 h-8 text-primary-400" />
        </div>
        <div className="text-base font-semibold text-slate-800">No pending {label.toLowerCase()}</div>
        <div className="text-sm text-slate-500 mt-1.5">Jab koi request aayegi, yahan dikhegi.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-title">Approvals</h1>
        <p className="page-sub">Review and action pending requests across the org</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ key, count, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition border ${tab === key ? 'bg-white border-slate-200 text-slate-900 shadow-card' : 'bg-transparent border-transparent text-slate-600 hover:bg-white/60 hover:border-slate-200'}`}>
            <Icon className={`w-4 h-4 ${tab === key ? 'text-primary-600' : 'text-slate-400'}`} />
            {key}
            <span className={`pill ${count > 0 ? 'bg-red-50 text-red-600' : tab === key ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Revise Requests */}
      {tab === 'Revise Requests' && (
        reviseRequests.length === 0 ? <EmptyState icon={ReviseIcon} label="Revise Requests" /> : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Task</th>
                  <th className="table-th">Doer</th>
                  <th className="table-th">Requested On</th>
                  <th className="table-th">Remarks</th>
                  <th className="table-th">Action</th>
                </tr>
              </thead>
              <tbody>
                {reviseRequests.map((t, i) => (
                  <tr key={t.id} className="table-row">
                    <td className="table-td text-slate-400 text-xs font-mono">{i + 1}</td>
                    <td className="table-td font-medium text-slate-800 max-w-[240px] truncate">{t.description}</td>
                    <td className="table-td text-slate-600">{t.doer}</td>
                    <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.createdAt)}</td>
                    <td className="table-td text-slate-500">{t.remarks || '—'}</td>
                    <td className="table-td">
                      <div className="flex gap-1.5">
                        <button onClick={() => grantRevise(t)} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">Grant</button>
                        <button onClick={() => denyRevise(t)}  className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer">Deny</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Task Approvals */}
      {tab === 'Task Approvals' && (
        taskApprovals.length === 0 ? <EmptyState icon={TaskIcon} label="Task Approvals" /> : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Task</th>
                  <th className="table-th">Assigned To</th>
                  <th className="table-th">Client</th>
                  <th className="table-th">Due Date</th>
                  <th className="table-th">Priority</th>
                  <th className="table-th">Action</th>
                </tr>
              </thead>
              <tbody>
                {taskApprovals.map((t, i) => (
                  <tr key={t.id} className="table-row">
                    <td className="table-td text-slate-400 text-xs font-mono">{i + 1}</td>
                    <td className="table-td font-medium text-slate-800 max-w-[220px] truncate">{t.description}</td>
                    <td className="table-td text-slate-600">{t.doer}</td>
                    <td className="table-td text-slate-500">{t.client || '—'}</td>
                    <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.dueDate)}</td>
                    <td className="table-td">
                      <span className={`pill ${t.priority === 'High' ? 'bg-red-50 text-red-700' : t.priority === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{t.priority || 'Low'}</span>
                    </td>
                    <td className="table-td">
                      <div className="flex gap-1.5">
                        <button onClick={() => approveTask(t)} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">Approve</button>
                        <button onClick={() => rejectTask(t)}  className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer">Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

    </div>
  );
}

function ReviseIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/></svg>; }
function TaskIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>; }

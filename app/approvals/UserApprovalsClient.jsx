'use client';
import { useState } from 'react';

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const REVISE_STATUS = {
  pending: { label: '⏳ Pending Admin',  cls: 'bg-amber-50 text-amber-700'    },
  granted: { label: '✓ Granted',          cls: 'bg-emerald-50 text-emerald-700' },
  denied:  { label: '✕ Denied',           cls: 'bg-red-50 text-red-700'         },
};

function EmptyState({ label }) {
  return (
    <div className="card p-14 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
        <svg className="w-7 h-7 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/>
        </svg>
      </div>
      <div className="text-sm font-medium text-slate-700">No {label}</div>
      <div className="text-xs text-slate-500 mt-1">Your {label.toLowerCase()} will appear here.</div>
    </div>
  );
}

export default function UserApprovalsClient({ myReviseRequests = [], myTaskApprovals = [] }) {
  const [tab, setTab] = useState('revise');

  const TABS = [
    { key: 'revise',   label: 'Revise Requests',   count: myReviseRequests.length  },
    { key: 'approval', label: 'Pending Approvals',  count: myTaskApprovals.length   },
  ];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ key, label, count }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition border ${
              tab === key
                ? 'bg-white border-slate-200 text-slate-900 shadow-card'
                : 'bg-transparent border-transparent text-slate-600 hover:bg-white/60 hover:border-slate-200'
            }`}>
            {label}
            <span className={`pill ${count > 0 ? 'bg-red-50 text-red-600' : tab === key ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-500'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Revise Requests tab */}
      {tab === 'revise' && (
        myReviseRequests.length === 0
          ? <EmptyState label="Revise Requests" />
          : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="table-th">#</th>
                    <th className="table-th">Task</th>
                    <th className="table-th">Due Date</th>
                    <th className="table-th">Requested On</th>
                    <th className="table-th">Remarks</th>
                    <th className="table-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {myReviseRequests.map((t, i) => {
                    const s = REVISE_STATUS[t.reviseAction] || REVISE_STATUS.pending;
                    return (
                      <tr key={t.id} className="table-row">
                        <td className="table-td text-slate-400 text-xs font-mono">{i + 1}</td>
                        <td className="table-td font-medium text-slate-800 max-w-[280px] truncate">{t.description}</td>
                        <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.dueDate)}</td>
                        <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.createdAt)}</td>
                        <td className="table-td text-slate-500 max-w-[200px] truncate">{t.remarks || '—'}</td>
                        <td className="table-td">
                          <span className={`pill font-semibold ${s.cls}`}>{s.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
      )}

      {/* Pending Approvals tab */}
      {tab === 'approval' && (
        myTaskApprovals.length === 0
          ? <EmptyState label="Pending Approvals" />
          : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="table-th">#</th>
                    <th className="table-th">Task</th>
                    <th className="table-th">Due Date</th>
                    <th className="table-th">Submitted On</th>
                    <th className="table-th">Priority</th>
                    <th className="table-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {myTaskApprovals.map((t, i) => (
                    <tr key={t.id} className="table-row">
                      <td className="table-td text-slate-400 text-xs font-mono">{i + 1}</td>
                      <td className="table-td font-medium text-slate-800 max-w-[280px] truncate">{t.description}</td>
                      <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.dueDate)}</td>
                      <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.createdAt)}</td>
                      <td className="table-td">
                        <span className={`pill ${
                          t.priority === 'High'   ? 'bg-red-50 text-red-600'   :
                          t.priority === 'Medium' ? 'bg-amber-50 text-amber-600' :
                          'bg-slate-100 text-slate-500'
                        }`}>{t.priority || 'Low'}</span>
                      </td>
                      <td className="table-td">
                        <span className="pill bg-orange-50 text-orange-600 font-semibold">⏳ Awaiting Admin</span>
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

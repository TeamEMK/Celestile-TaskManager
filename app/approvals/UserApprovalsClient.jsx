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

function ReviseIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/></svg>; }
function TaskIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>; }

function EmptyState({ icon: Icon, label }) {
  return (
    <div className="p-14 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
        <Icon className="w-7 h-7 text-primary-400" />
      </div>
      <div className="text-[13.5px] font-semibold text-slate-700">No {label}</div>
      <div className="text-[12px] text-slate-500 mt-0.5">Your {label.toLowerCase()} will appear here.</div>
    </div>
  );
}

export default function UserApprovalsClient({ myReviseRequests = [], myTaskApprovals = [] }) {
  const [tab, setTab] = useState('revise');

  const TABS = [
    { key: 'revise',   label: 'Revise Requests',   count: myReviseRequests.length, icon: ReviseIcon },
    { key: 'approval', label: 'Pending Approvals',  count: myTaskApprovals.length,  icon: TaskIcon   },
  ];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Tab bar */}
      <div className="seg">
        {TABS.map(({ key, label, count, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`seg-btn flex items-center gap-1.5 ${tab === key ? 'seg-btn-active' : ''}`}>
            <Icon className={`w-3.5 h-3.5 ${tab === key ? 'text-primary-600' : 'text-slate-400'}`} />
            {label}
            <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${count > 0 ? 'bg-red-100 text-red-600' : tab === key ? 'bg-primary-50 text-primary-700' : 'bg-slate-200 text-slate-600'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Revise Requests tab */}
      {tab === 'revise' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-gradient-to-r from-slate-50/80 to-transparent">
            <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center"><ReviseIcon className="w-4 h-4" /></div>
            <div>
              <h2 className="text-[13.5px] font-semibold text-slate-900">Revise Requests</h2>
              <p className="text-[11.5px] text-slate-500">{myReviseRequests.length} submitted by you</p>
            </div>
          </div>
          {myReviseRequests.length === 0 ? <EmptyState icon={ReviseIcon} label="Revise Requests" /> : (
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
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
          )}
        </div>
      )}

      {/* Pending Approvals tab */}
      {tab === 'approval' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-gradient-to-r from-slate-50/80 to-transparent">
            <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center"><TaskIcon className="w-4 h-4" /></div>
            <div>
              <h2 className="text-[13.5px] font-semibold text-slate-900">Pending Approvals</h2>
              <p className="text-[11.5px] text-slate-500">{myTaskApprovals.length} awaiting admin</p>
            </div>
          </div>
          {myTaskApprovals.length === 0 ? <EmptyState icon={TaskIcon} label="Pending Approvals" /> : (
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
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
                      <td className="table-td font-medium text-slate-800 max-w-[280px]">
                        <div className="truncate">{t.description}</div>
                        {(t.image || t.attachment || t.url) && (
                          <div className="flex items-center gap-1.5 mt-1">
                            {t.image && (
                              <a href={t.image} target="_blank" rel="noopener noreferrer" title="View attached photo">
                                <img src={t.image} alt="" className="w-6 h-6 rounded object-cover border border-slate-200" />
                              </a>
                            )}
                            {t.attachment && (
                              <a href={t.attachment} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary-600 hover:underline shrink-0">📄 View PDF</a>
                            )}
                            {t.url && (
                              <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary-600 hover:underline shrink-0" title={t.url}>🔗 Link</a>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.dueDate)}</td>
                      <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.createdAt)}</td>
                      <td className="table-td">
                        <span className={`pill ${
                          t.priority === 'High'   ? 'bg-red-50 text-red-600 border border-red-100'   :
                          t.priority === 'Medium' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                          'bg-blue-50 text-blue-600 border border-blue-100'
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
          )}
        </div>
      )}

    </div>
  );
}

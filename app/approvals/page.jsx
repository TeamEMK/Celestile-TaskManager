'use client';
import { useState } from 'react';

const TABS = [
  { key: 'Task Approvals',     icon: 'task',     desc: 'Tasks awaiting your approval' },
  { key: 'Transfer Requests',  icon: 'transfer', desc: 'Task transfer requests between team members' },
  { key: 'Leave Approvals',    icon: 'leave',    desc: 'Time-off requests from your team' },
];

const Icons = {
  task:     (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>,
  transfer: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 3 4 4-4 4"/><path d="M21 7H4"/><path d="m7 21-4-4 4-4"/><path d="M3 17h17"/></svg>,
  leave:    (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h2M14 14h2M8 18h2"/></svg>,
};

export default function ApprovalsPage() {
  const [tab, setTab] = useState('Task Approvals');
  const active = TABS.find((t) => t.key === tab);
  const Ic = Icons[active.icon];

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-title">Approvals</h1>
        <p className="page-sub">Review and action pending requests across the org</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((s) => {
          const Icon = Icons[s.icon];
          return (
            <button
              key={s.key}
              onClick={() => setTab(s.key)}
              className={`group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition border ${
                tab === s.key
                  ? 'bg-white border-slate-200 text-slate-900 shadow-card'
                  : 'bg-transparent border-transparent text-slate-600 hover:bg-white/60 hover:border-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 ${tab === s.key ? 'text-primary-600' : 'text-slate-400'}`} />
              {s.key}
              <span className={`ml-1 pill ${tab === s.key ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-500'}`}>0</span>
            </button>
          );
        })}
      </div>

      <div className="card p-14 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-4">
          <Ic className="w-8 h-8 text-primary-500" />
        </div>
        <div className="text-base font-semibold text-slate-800">No pending {tab.toLowerCase()}</div>
        <div className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">{active.desc}. Items will appear here when team members submit requests.</div>
      </div>
    </div>
  );
}

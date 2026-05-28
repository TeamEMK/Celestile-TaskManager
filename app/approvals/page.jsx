// 'use client';
// import { useState } from 'react';

// const TABS = [
//   { key: 'Task Approvals',     icon: 'task',     desc: 'Tasks awaiting your approval' },
//   { key: 'Transfer Requests',  icon: 'transfer', desc: 'Task transfer requests between team members' },
//   { key: 'Leave Approvals',    icon: 'leave',    desc: 'Time-off requests from your team' },
// ];

// const Icons = {
//   task:     (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>,
//   transfer: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 3 4 4-4 4"/><path d="M21 7H4"/><path d="m7 21-4-4 4-4"/><path d="M3 17h17"/></svg>,
//   leave:    (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h2M14 14h2M8 18h2"/></svg>,
// };

// export default function ApprovalsPage() {
//   const [tab, setTab] = useState('Task Approvals');
//   const active = TABS.find((t) => t.key === tab);
//   const Ic = Icons[active.icon];

//   return (
//     <div className="space-y-5 animate-fade-in">
//       <div>
//         <h1 className="page-title">Approvals</h1>
//         <p className="page-sub">Review and action pending requests across the org</p>
//       </div>

//       <div className="flex gap-2 flex-wrap">
//         {TABS.map((s) => {
//           const Icon = Icons[s.icon];
//           return (
//             <button
//               key={s.key}
//               onClick={() => setTab(s.key)}
//               className={`group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition border ${
//                 tab === s.key
//                   ? 'bg-white border-slate-200 text-slate-900 shadow-card'
//                   : 'bg-transparent border-transparent text-slate-600 hover:bg-white/60 hover:border-slate-200'
//               }`}
//             >
//               <Icon className={`w-4 h-4 ${tab === s.key ? 'text-primary-600' : 'text-slate-400'}`} />
//               {s.key}
//               <span className={`ml-1 pill ${tab === s.key ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-500'}`}>0</span>
//             </button>
//           );
//         })}
//       </div>

//       <div className="card p-14 text-center">
//         <div className="w-16 h-16 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-4">
//           <Ic className="w-8 h-8 text-primary-500" />
//         </div>
//         <div className="text-base font-semibold text-slate-800">No pending {tab.toLowerCase()}</div>
//         <div className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">{active.desc}. Items will appear here when team members submit requests.</div>
//       </div>
//     </div>
//   );
// }
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TABS = [
  { key: 'Revise Requests',   icon: 'revise',   desc: 'Delegation revision requests from team members' },
  { key: 'Task Approvals',    icon: 'task',     desc: 'Tasks awaiting your approval' },
  { key: 'Transfer Requests', icon: 'transfer', desc: 'Task transfer requests between team members' },
  { key: 'Leave Approvals',   icon: 'leave',    desc: 'Time-off requests from your team' },
];

const Icons = {
  revise:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/></svg>,
  task:     (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>,
  transfer: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 3 4 4-4 4"/><path d="M21 7H4"/><path d="m7 21-4-4 4-4"/><path d="M3 17h17"/></svg>,
  leave:    (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h2M14 14h2M8 18h2"/></svg>,
};

export default function ApprovalsPage({ reviseRequests = [] }) {
  const router = useRouter();
  const [tab, setTab] = useState('Revise Requests');
  const [reviseDate, setReviseDate] = useState('');
  const [activeTask, setActiveTask] = useState(null);
  const [saving, setSaving] = useState(false);
  const todayISO = new Date().toISOString().split('T')[0];

  const active = TABS.find((t) => t.key === tab);
  const Ic = Icons[active.icon];

  async function grantRevise() {
    if (!reviseDate) { alert('Revise until date zaroori hai'); return; }
    setSaving(true);
    await fetch('/api/delegations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeTask.id, status: 'revise', dueDate: reviseDate }),
    });
    setSaving(false);
    setActiveTask(null);
    setReviseDate('');
    router.refresh();
  }

  async function denyRevise(task) {
    if (!confirm('Deny karna chahte ho?')) return;
    await fetch('/api/delegations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: 'pending' }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-title">Approvals</h1>
        <p className="page-sub">Review and action pending requests across the org</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((s) => {
          const Icon = Icons[s.icon];
          const count = s.key === 'Revise Requests' ? reviseRequests.length : 0;
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
              <span className={`ml-1 pill ${count > 0 ? 'bg-red-50 text-red-600' : tab === s.key ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Revise Requests Tab */}
      {tab === 'Revise Requests' && (
        reviseRequests.length === 0 ? (
          <div className="card p-14 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-4">
              <Ic className="w-8 h-8 text-primary-500" />
            </div>
            <div className="text-base font-semibold text-slate-800">No pending revise requests</div>
            <div className="text-sm text-slate-500 mt-1.5">Jab koi revise request aayegi, yahan dikhegi.</div>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="table-th">Task</th>
                  <th className="table-th">Doer</th>
                  <th className="table-th">Remarks</th>
                  <th className="table-th">Action</th>
                </tr>
              </thead>
              <tbody>
                {reviseRequests.map((t) => (
                  <tr key={t.id} className="table-row">
                    <td className="table-td font-medium text-slate-800 max-w-[260px] truncate">{t.description}</td>
                    <td className="table-td text-slate-600">{t.doer}</td>
                    <td className="table-td text-slate-500">{t.remarks || '—'}</td>
                    <td className="table-td">
                      <div className="flex gap-1.5">
                        <button onClick={() => { setActiveTask(t); setReviseDate(''); }} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">Grant</button>
                        <button onClick={() => denyRevise(t)} className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer">Deny</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Other tabs */}
      {tab !== 'Revise Requests' && (
        <div className="card p-14 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-4">
            <Ic className="w-8 h-8 text-primary-500" />
          </div>
          <div className="text-base font-semibold text-slate-800">No pending {tab.toLowerCase()}</div>
          <div className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">{active.desc}. Items will appear here when team members submit requests.</div>
        </div>
      )}

      {/* Grant Modal */}
      {activeTask && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !saving && setActiveTask(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900 mb-1">Grant Revise Request</h2>
            <p className="text-[12px] text-slate-500 mb-4">Approve this revision request and send the task back?</p>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 mb-4">
              <div className="font-medium text-slate-800 text-sm">{activeTask.description}</div>
              <div className="text-[12px] text-slate-500 mt-0.5">Doer: <b>{activeTask.doer}</b></div>
              {activeTask.remarks && <div className="text-[12px] text-slate-600 mt-2 pt-2 border-t border-slate-200">Note: {activeTask.remarks}</div>}
            </div>
            <label className="label">Revise Until <span className="text-red-500">*</span></label>
            <input type="date" className="input mb-4" min={todayISO} value={reviseDate} onChange={(e) => setReviseDate(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setActiveTask(null)} disabled={saving} className="btn-secondary">Cancel</button>
              <button onClick={grantRevise} disabled={saving} className="btn-success">{saving ? 'Saving…' : 'Grant Revise'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
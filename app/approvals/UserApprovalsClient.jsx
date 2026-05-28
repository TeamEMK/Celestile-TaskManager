'use client';

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const STATUS = {
  pending: { label: '⏳ Pending',  cls: 'bg-amber-50 text-amber-700'   },
  granted: { label: '✓ Granted',   cls: 'bg-emerald-50 text-emerald-700' },
  denied:  { label: '✕ Denied',    cls: 'bg-red-50 text-red-700'         },
};

export default function UserApprovalsClient({ myRequests = [] }) {
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-title">My Approvals</h1>
        <p className="page-sub">Aapke revise requests aur unka status</p>
      </div>

      {myRequests.length === 0 ? (
        <div className="card p-14 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
            <svg className="w-7 h-7 text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/></svg>
          </div>
          <div className="text-sm font-medium text-slate-700">Koi revise request nahi</div>
          <div className="text-xs text-slate-500 mt-1">Jab aap koi revise request karoge, yahan dikhegi.</div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">#</th>
                <th className="table-th">Task</th>
                <th className="table-th">Client</th>
                <th className="table-th">Due Date</th>
                <th className="table-th">Requested On</th>
                <th className="table-th">Remarks</th>
                <th className="table-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((t, i) => {
                const s = STATUS[t.reviseAction] || STATUS.pending;
                return (
                  <tr key={t.id} className="table-row">
                    <td className="table-td text-slate-400 text-xs font-mono">{i + 1}</td>
                    <td className="table-td font-medium text-slate-800 max-w-[240px] truncate">{t.description}</td>
                    <td className="table-td text-slate-500">{t.client || '—'}</td>
                    <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.dueDate)}</td>
                    <td className="table-td text-slate-500 whitespace-nowrap">{fmt(t.createdAt)}</td>
                    <td className="table-td text-slate-500">{t.remarks || '—'}</td>
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
  );
}

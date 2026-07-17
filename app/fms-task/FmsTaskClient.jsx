'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FmsTaskClient({ tasks }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState(null);

  const fmt = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const todayISO = new Date().toISOString().slice(0, 10);
  const isOverdue = (t) => t.dueDate && String(t.dueDate).slice(0, 10) < todayISO;
  const overdueCount = tasks.filter(isOverdue).length;

  async function markDone(t) {
    setBusyId(t.id);
    try {
      await fetch('/api/fms/entries/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: t.entryId, stepIndex: t.stepIndex }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <IconFms className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h1 className="font-display text-[18px] font-semibold tracking-tight text-slate-900">FMS Task</h1>
            <p className="text-[11.5px] text-slate-500">Your pending FMS Master steps</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill bg-primary-50 text-primary-700 border border-primary-100">{tasks.length} pending</span>
          {overdueCount > 0 && (
            <span className="pill bg-red-50 text-red-600 border border-red-100">{overdueCount} overdue</span>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        {tasks.length === 0 ? (
          <div className="p-14 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 grid place-items-center mx-auto mb-3">
              <svg className="w-6 h-6 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
            </div>
            <div className="text-[13.5px] font-semibold text-slate-700">All caught up!</div>
            <div className="text-[12px] text-slate-500 mt-0.5">No pending FMS steps assigned to you.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                <tr>
                  <th className="table-th">Flow</th>
                  <th className="table-th">Step</th>
                  <th className="table-th">Client</th>
                  <th className="table-th">Due</th>
                  <th className="table-th text-right pr-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const overdue = isOverdue(t);
                  return (
                    <tr key={t.id} className="table-row">
                      <td className="table-td font-medium text-slate-800">{t.flowName}</td>
                      <td className="table-td text-slate-700">{t.stepName}</td>
                      <td className="table-td text-slate-600">{t.client || '—'}</td>
                      <td className={`table-td whitespace-nowrap text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                        <span className="inline-flex items-center gap-1">
                          {overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                          {fmt(t.dueDate)}
                        </span>
                      </td>
                      <td className="table-td">
                        <div className="flex justify-end pr-2">
                          <button
                            onClick={() => markDone(t)}
                            disabled={busyId === t.id}
                            className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {busyId === t.id ? 'Saving…' : '✓ Done'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function IconFms(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

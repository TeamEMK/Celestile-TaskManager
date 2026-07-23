'use client';

// Cross-step pending overview ("Process Coordinator" view) — monitoring
// only, no Done action (that lives in Dashboard / All Tasks via FmsDoneModal).
export default function PcView({ items }) {
  if (!items.length) {
    return (
      <div className="card p-14 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 grid place-items-center mx-auto mb-3">
          <svg className="w-6 h-6 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>
        </div>
        <div className="text-[13.5px] font-semibold text-slate-700">All done — no pending entries across any step!</div>
      </div>
    );
  }

  const colKeys = [...new Set(items.flatMap((it) => Object.keys(it.data)))];

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto max-h-[calc(100vh-320px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
            <tr>
              <th className="table-th">Step</th>
              <th className="table-th">Doer</th>
              <th className="table-th">Planned Date</th>
              {colKeys.map((k) => <th key={k} className="table-th">{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="table-row">
                <td className="table-td font-medium text-slate-800">{it.stepName}</td>
                <td className="table-td text-slate-700">{it.doer}</td>
                <td className="table-td text-slate-700">{it.plannedDate || '—'}</td>
                {colKeys.map((k) => <td key={k} className="table-td text-slate-600">{it.data[k] || '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

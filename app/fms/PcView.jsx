'use client';

// Cross-step pending overview ("Process Coordinator" view) — monitoring, no
// Done action (that lives in Dashboard / All Tasks via FmsDoneModal). The one
// action it does carry is Assign / Reassign for steps whose doer is picked
// per row: `canAssign(stepId)` says whether the viewer may do that for a
// step, `onAssign(item)` opens the picker.
export default function PcView({ items, canAssign, onAssign }) {
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
  const showActions = !!onAssign && items.some((it) => it.assigned && canAssign?.(it.stepId));

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
              {showActions && <th className="table-th"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="table-row">
                <td className="table-td font-medium text-slate-800">{it.stepName}</td>
                <td className="table-td text-slate-700">
                  {it.needsAssign
                    ? <span className="pill bg-amber-50 text-amber-700">Unassigned</span>
                    : it.doer}
                </td>
                <td className="table-td text-slate-700">{it.plannedDate || '—'}</td>
                {colKeys.map((k) => <td key={k} className="table-td text-slate-600">{it.data[k] || '—'}</td>)}
                {showActions && (
                  <td className="table-td whitespace-nowrap">
                    {it.assigned && canAssign?.(it.stepId) && (
                      <button type="button" onClick={() => onAssign(it)}
                        className={`pill cursor-pointer ${it.needsAssign ? 'bg-primary-50 text-primary-700 hover:bg-primary-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {it.needsAssign ? 'Assign' : 'Reassign'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

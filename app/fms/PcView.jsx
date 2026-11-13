'use client';

// Cross-step pending overview ("Process Coordinator" view) — monitoring, no
// Done action (that lives in Dashboard / All Tasks via FmsDoneModal). The one
// action it does carry is Assign / Reassign for steps whose doer is picked
// per row: `canAssign(stepId)` says whether the viewer may do that for a
// step, `onAssign(item)` opens the picker.
import { useMemo, useState } from 'react';
import { usePaged, Pager } from '../components/Pager';

export default function PcView({ items, canAssign, onAssign }) {
  // Every pending row across all steps used to be drawn at once (and the
  // column list rebuilt on each render). Now: memoised columns, a search box,
  // and one page of rows. Columns still come from every item.
  const [q, setQ] = useState('');
  const colKeys = useMemo(() => [...new Set(items.flatMap((it) => Object.keys(it.data)))], [items]);
  const matched = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((it) => [it.stepName, it.doer, it.plannedDate, ...Object.values(it.data || {})]
      .some((v) => String(v ?? '').toLowerCase().includes(t)));
  }, [items, q]);
  const { pageRows, pager } = usePaged(matched, { resetKey: q });

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

  const showActions = !!onAssign && items.some((it) => it.assigned && canAssign?.(it.stepId));

  return (
    <div className="card overflow-hidden">
      {items.length > 25 && (
        <div className="px-4 py-2.5 border-b border-slate-100">
          <input className="input max-w-sm" placeholder="Search step / doer / order…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
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
            {pageRows.map((it, i) => (
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
        {matched.length === 0 && <div className="p-8 text-center text-[12.5px] text-slate-400">No pending entry matches "{q}".</div>}
      </div>
      <Pager {...pager} noun="entry" />
    </div>
  );
}

'use client';
import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AddFMSModal from '../components/AddFMSModal';

export default function FMSClient({ rows, steps }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const fmt = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  const fmtEntry = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const computeDelay = (planned, actual) => {
    if (!planned || !actual) return '';
    const diff = new Date(actual) - new Date(planned);
    if (diff <= 0) return '';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}:${m.toString().padStart(2, '0')}`;
  };
  const status = (s) => {
    if (s.actual) return { label: 'Done', cls: 'bg-emerald-50 text-emerald-700' };
    if (s.planned && new Date(s.planned) < new Date()) return { label: 'Delayed', cls: 'bg-red-50 text-red-700' };
    return { label: 'Pending', cls: 'bg-amber-50 text-amber-700' };
  };

  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      r.clientName?.toLowerCase().includes(s) ||
      (r.platforms || '').toLowerCase().includes(s) ||
      (r.doer || '').toLowerCase().includes(s) ||
      (r.mobile || '').toLowerCase().includes(s)
    );
  }, [rows, search]);

  // Aggregate progress per client
  const progressOf = (r) => {
    const done = r.steps.filter((s) => s.actual).length;
    return Math.round((done / r.steps.length) * 100);
  };

  // Stats
  const stats = useMemo(() => {
    let totalSteps = 0, done = 0, delayed = 0;
    rows.forEach((r) => r.steps.forEach((s) => {
      totalSteps++;
      if (s.actual) done++;
      else if (s.planned && new Date(s.planned) < new Date()) delayed++;
    }));
    return { clients: rows.length, totalSteps, done, delayed, pending: totalSteps - done };
  }, [rows]);

  async function markDone(fmsId, stepIndex) {
    await fetch('/api/fms/step', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fmsId, stepIndex }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
<button onClick={() => setOpen(true)} className="btn-primary">
          <PlusIcon /> New FMS Entry
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Mini label="Clients"      value={stats.clients}  tone="primary" />
        <Mini label="Steps Done"   value={stats.done}     tone="emerald" />
        <Mini label="Pending"      value={stats.pending}  tone="amber" />
        <Mini label="Delayed"      value={stats.delayed}  tone="red" />
      </div>

      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by client, doer, platform…" className="input pl-9 w-80" />
        </div>
        <div className="flex-1" />
        <div className="text-xs text-slate-500">{filtered.length} of {rows.length} entries</div>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
              <svg className="w-7 h-7 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div className="text-sm font-medium text-slate-800">No FMS entries</div>
            <div className="text-xs text-slate-500 mt-1">Add your first client to start tracking the campaign workflow.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs" style={{ minWidth: 2200 }}>
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="text-left px-4 py-3 sticky left-0 bg-slate-50 z-10 font-semibold border-r border-slate-200 w-[110px]">Entry</th>
                  <th className="text-left px-4 py-3 sticky left-[110px] bg-slate-50 z-10 font-semibold border-r border-slate-200 w-[220px]">Client</th>
                  <th className="text-left px-3 py-3 font-semibold w-[180px]">Platforms</th>
                  <th className="text-left px-3 py-3 font-semibold">Mobile</th>
                  <th className="text-left px-3 py-3 font-semibold">Doer</th>
                  <th className="text-left px-3 py-3 font-semibold w-[140px]">Progress</th>
                  {steps.map((s, i) => (
                    <th key={i} colSpan={4} className="text-center px-3 py-3 border-l-2 border-slate-200 font-semibold bg-slate-100/50">
                      <div className="text-[11px]">Step {i + 1}</div>
                      <div className="text-[10px] font-normal text-slate-500 mt-0.5">{s.name}</div>
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-50/60 text-slate-500 text-[10px] uppercase tracking-wider">
                  <th className="sticky left-0 bg-slate-50/60 border-r border-slate-200"></th>
                  <th className="sticky left-[110px] bg-slate-50/60 border-r border-slate-200"></th>
                  <th></th><th></th><th></th><th></th>
                  {steps.map((_, i) => (
                    <Fragment key={`hdr-${i}`}>
                      <th className="px-2 py-1.5 border-l-2 border-slate-200 font-medium">Planned</th>
                      <th className="px-2 py-1.5 font-medium">Actual</th>
                      <th className="px-2 py-1.5 font-medium">Delay</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => {
                  const pct = progressOf(r);
                  return (
                    <tr key={r.id} className={`border-t border-slate-100 hover:bg-primary-50/30 ${idx % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                      <td className="px-4 py-3 sticky left-0 bg-inherit z-10 whitespace-nowrap border-r border-slate-100">{fmtEntry(r.createdAt)}</td>
                      <td className="px-4 py-3 sticky left-[110px] bg-inherit z-10 border-r border-slate-100">
                        <div className="font-semibold text-slate-900 whitespace-nowrap">{r.clientName}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 max-w-[180px] truncate" title={r.platforms}>{r.platforms || '—'}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-600">{r.mobile || '—'}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {r.doer ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar name={r.doer} />
                            <span className="text-slate-700">{r.doer}</span>
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
                            <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-primary-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }}/>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-700 tabular-nums w-8 text-right">{pct}%</span>
                        </div>
                      </td>
                      {r.steps.map((s, i) => {
                        const st = status(s);
                        return (
                          <Fragment key={`step-${r.id}-${i}`}>
                            <td className="px-2 py-3 border-l-2 border-slate-100 whitespace-nowrap text-slate-600">{fmt(s.planned)}</td>
                            <td className="px-2 py-3 whitespace-nowrap text-slate-600">{fmt(s.actual)}</td>
                            <td className="px-2 py-3 whitespace-nowrap text-red-600 font-medium tabular-nums">{computeDelay(s.planned, s.actual)}</td>
                            <td className="px-2 py-3 whitespace-nowrap">
                              {s.actual ? (
                                <span className={`pill ${st.cls}`}>✓ {st.label}</span>
                              ) : (
                                <button
                                  onClick={() => markDone(r.id, i)}
                                  className={`pill ${st.cls} hover:ring-2 hover:ring-emerald-300/50 cursor-pointer transition`}
                                  title="Click to mark done"
                                >
                                  {st.label}
                                </button>
                              )}
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddFMSModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

const MINI_TONES = {
  primary: 'text-primary-700 bg-primary-50',
  emerald: 'text-emerald-700 bg-emerald-50',
  amber:   'text-amber-700 bg-amber-50',
  red:     'text-red-700 bg-red-50',
};

function Mini({ label, value, tone }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{label}</div>
      <div className="flex items-baseline justify-between mt-1.5">
        <div className="text-2xl font-bold text-slate-900 tracking-tight">{value}</div>
        <span className={`pill ${MINI_TONES[tone]}`}>{tone === 'red' ? 'attention' : tone === 'emerald' ? 'good' : 'live'}</span>
      </div>
    </div>
  );
}

function Avatar({ name = '' }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '·';
  return <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white grid place-items-center text-[9px] font-bold shrink-0">{ini}</div>;
}

function PlusIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }

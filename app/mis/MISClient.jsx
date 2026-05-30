'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MISClient({ initialRows = [], initialSummary = {}, initialStart, initialEnd, initialType }) {
  const router  = useRouter();
  const [start,   setStart]   = useState(initialStart);
  const [end,     setEnd]     = useState(initialEnd);
  const [tab,     setTab]     = useState(initialType);
  const [rows,    setRows]    = useState(initialRows);
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [detail,  setDetail]  = useState(null);

  const TABS = ['Delegation MIS', 'Checklist MIS', 'All MIS'];

  async function generate() {
    if (!start || !end) { alert('Please select Start Date and End Date first.'); return; }
    setLoading(true);
    setDetail(null);
    try {
      const res  = await fetch(`/api/mis?start=${start}&end=${end}&type=${encodeURIComponent(tab)}`);
      const json = await res.json();
      setRows(json.rows || []);
      setSummary(json.summary || {});
    } catch { setRows([]); setSummary({}); }
    setLoading(false);
  }

  function exportCSV() {
    if (!rows.length) { alert('Generate the report first.'); return; }
    const headers = ['#', 'Name', 'Total', 'Pending', 'Completed', 'Revised', 'Delayed', 'Score %'];
    const csv = [
      headers.join(','),
      ...rows.map((r, i) => [i + 1, r.name, r.total, r.pending, r.completed, r.revised, r.delayed, r.score + '%'].join(',')),
    ].join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `MIS_${tab.replace(/\s/g, '_')}_${start}_to_${end}.csv`,
    });
    a.click();
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-title">MIS Report</h1>
      </div>

      {/* Filter bar */}
      <div className="card p-5 space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="label">Start Date</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input !w-44" />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input !w-44" />
          </div>
          <button onClick={generate} disabled={loading} className="btn-primary">
            {loading
              ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg> Generating…</>
              : <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 14 4-4 4 4 5-6"/><path d="M3 3v18h18"/></svg> Generate</>
            }
          </button>
          <button onClick={exportCSV} className="btn-secondary">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
            Export CSV
          </button>
        </div>
        <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-100">
          {TABS.map((t) => (
            <button key={t} onClick={() => { setTab(t); setRows([]); setSummary({}); setDetail(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${tab === t ? 'bg-primary-50 text-primary-700 border-primary-200' : 'text-slate-600 hover:bg-slate-50 border-slate-200'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Summary pills */}
      {Object.keys(summary).length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {Object.entries(summary).map(([k, v]) => (
            <div key={k} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{k}</div>
              <div className="text-lg font-bold text-slate-900 tabular-nums">{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
              <svg className="w-7 h-7 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/></svg>
            </div>
            <div className="text-sm font-medium text-slate-800">
              {Object.keys(summary).length > 0 ? 'No records in this period.' : 'Select a date range and click Generate.'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wider font-semibold text-slate-500">#</th>
                  <th className="text-left px-5 py-3 text-[11px] uppercase tracking-wider font-semibold text-slate-500">Name <span className="normal-case font-normal text-slate-400">(click for details)</span></th>
                  <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-slate-500">Total</th>
                  <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-slate-500">Pending</th>
                  <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-slate-500">Completed</th>
                  <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-slate-500">Revised</th>
                  <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-slate-500">Delayed</th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-slate-500">Score %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isGood   = r.score >= 0;
                  const barWidth = Math.min(Math.abs(r.score), 100);
                  const isOpen   = detail === r.name;
                  return (
                    <EmployeeRow
                      key={r.name}
                      r={r} i={i} isGood={isGood} barWidth={barWidth} isOpen={isOpen}
                      onToggle={() => setDetail(isOpen ? null : r.name)}
                      start={start} end={end} tab={tab}
                    />
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

function EmployeeRow({ r, i, isGood, barWidth, isOpen, onToggle, start, end, tab }) {
  const [tasks,   setTasks]   = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadTasks() {
    if (tasks) return; // already loaded
    setLoading(true);
    try {
      const res  = await fetch(`/api/mis?start=${start}&end=${end}&type=${encodeURIComponent(tab)}&employee=${encodeURIComponent(r.name)}`);
      const json = await res.json();
      setTasks(json.rows || []);
    } catch { setTasks([]); }
    setLoading(false);
  }

  function handleToggle() {
    onToggle();
    if (!isOpen) loadTasks();
  }

  return (
    <>
      <tr onClick={handleToggle} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition">
        <td className="px-5 py-3.5 text-xs text-slate-400 font-mono">{i + 1}</td>
        <td className="px-5 py-3.5 font-medium text-primary-600 hover:text-primary-800">{r.name}</td>
        <td className="px-4 py-3.5 text-center font-semibold text-slate-800">{r.total}</td>
        <td className="px-4 py-3.5 text-center font-semibold text-orange-500">{r.pending}</td>
        <td className="px-4 py-3.5 text-center font-semibold text-emerald-600">{r.completed}</td>
        <td className="px-4 py-3.5 text-center font-semibold text-amber-500">{r.revised}</td>
        <td className="px-4 py-3.5 text-center font-semibold text-red-500">{r.delayed}</td>
        <td className="px-4 py-3.5 min-w-[160px]">
          <div className={`font-bold text-sm ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
            {r.score > 0 ? '+' : ''}{r.score}%
          </div>
          <div className={`flex items-center gap-1 mt-0.5 text-[10px] font-medium ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
            {isGood
              ? <><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 12 2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Perfect</>
              : <><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> Needs Improvement</>
            }
          </div>
          <div className="mt-1 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${isGood ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${barWidth}%` }} />
          </div>
        </td>
      </tr>

      {isOpen && (
        <tr>
          <td colSpan={8} className="bg-slate-50 px-8 py-3 border-t border-slate-200">
            {loading || !tasks ? (
              <div className="text-xs text-slate-500 py-2">Loading…</div>
            ) : tasks.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">No tasks found.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    <th className="text-left py-1.5 pr-4">#</th>
                    <th className="text-left py-1.5 pr-4">Description</th>
                    <th className="text-left py-1.5 pr-4">Client</th>
                    <th className="text-left py-1.5 pr-4">Due Date</th>
                    <th className="text-left py-1.5 pr-4">Priority</th>
                    <th className="text-left py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t, j) => (
                    <tr key={j} className="border-t border-slate-200/60">
                      <td className="py-1.5 pr-4 text-slate-400">{j + 1}</td>
                      <td className="py-1.5 pr-4 text-slate-700 max-w-xs truncate">{t['Description']}</td>
                      <td className="py-1.5 pr-4 text-slate-500">{t['Client']}</td>
                      <td className="py-1.5 pr-4 text-slate-500 whitespace-nowrap">{t['Due Date']}</td>
                      <td className="py-1.5 pr-4">
                        <span className={`pill text-[10px] ${t['Priority'] === 'High' ? 'bg-red-50 text-red-700' : t['Priority'] === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          {t['Priority'] || 'Low'}
                        </span>
                      </td>
                      <td className="py-1.5">
                        <span className={`pill text-[10px] ${t['Status'] === 'done' ? 'bg-emerald-50 text-emerald-700' : t['Status'] === 'pending' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {t['Status']}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

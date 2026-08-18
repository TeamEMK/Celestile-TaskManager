'use client';
import { useState, useEffect } from 'react';
import { HorizBarChart } from '@/app/components/Charts';
import Icon from '@/app/components/Icon';

export default function MISClient({ initialRows = [], initialSummary = {}, initialStart, initialEnd, initialType }) {
  const [start,      setStart]      = useState(initialStart);
  const [end,        setEnd]        = useState(initialEnd);
  const [tab,        setTab]        = useState(initialType);
  const [rows,       setRows]       = useState(initialRows);
  const [summary,    setSummary]    = useState(initialSummary);
  const [loading,    setLoading]    = useState(false);
  const [modal,      setModal]      = useState(null); // { row, tasks }
  const [taskLoad,   setTaskLoad]   = useState(false);

  useEffect(() => {
    if (initialStart && initialEnd) generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const TABS = ['Delegation MIS', 'Checklist MIS', 'FMS MIS', 'All MIS'];

  async function generate() {
    if (!start || !end) { alert('Please select Start Date and End Date first.'); return; }
    setLoading(true); setModal(null);
    try {
      const res  = await fetch(`/api/mis?start=${start}&end=${end}&type=${encodeURIComponent(tab)}`);
      const json = await res.json();
      setRows(json.rows || []);
      setSummary(json.summary || {});
    } catch { setRows([]); setSummary({}); }
    setLoading(false);
  }

  async function openDetail(r) {
    setModal({ row: r, tasks: null });
    setTaskLoad(true);
    try {
      const res  = await fetch(`/api/mis?start=${start}&end=${end}&type=${encodeURIComponent(tab)}&employee=${encodeURIComponent(r.name)}`);
      const json = await res.json();
      setModal({ row: r, tasks: json.rows || [] });
    } catch { setModal({ row: r, tasks: [] }); }
    setTaskLoad(false);
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

  const isGood = (score) => score >= 0;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div>
        <h1 className="page-title">MIS Report</h1>
        <p className="page-sub">Performance &amp; completion analytics across employees</p>
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
              : <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 14 4-4 4 4 5-6"/><path d="M3 3v18h18"/></svg> Generate</>}
          </button>
          <button onClick={exportCSV} className="btn-secondary">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
            Export CSV
          </button>
        </div>
        <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-100">
          {TABS.map((t) => (
            <button key={t} onClick={() => { setTab(t); setRows([]); setSummary({}); setModal(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${tab === t ? 'bg-primary-50 text-primary-700 border-primary-200' : 'text-slate-600 hover:bg-slate-50 border-slate-200 bg-white'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI cards */}
      {Object.keys(summary).length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(summary).map(([k, v], i) => (
            <SummaryKpi key={k} label={k} value={v} tone={SUMMARY_TONES[i % SUMMARY_TONES.length]} />
          ))}
        </div>
      )}

      {/* Score chart */}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <HorizBarChart
            title="Completion Score by Employee"
            subtitle="Higher is better"
            items={rows.filter(r => r.score >= 0).map(r => ({ name: r.name, value: r.score }))}
            color="#10b981"
            icon="trophy"
            unit="%"
          />
          <HorizBarChart
            title="Tasks Completed"
            subtitle="Total tasks done in range"
            items={rows.map(r => ({ name: r.name, value: r.completed })).sort((a, b) => b.value - a.value)}
            color="#2563eb"
            icon="check"
          />
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-gradient-to-r from-slate-50/80 to-transparent">
          <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center"><IconTable /></div>
          <div>
            <h2 className="text-[13.5px] font-semibold text-slate-900">Employee Report</h2>
            <p className="text-[11.5px] text-slate-500">{rows.length} employee{rows.length === 1 ? '' : 's'} — click a row for task details</p>
          </div>
        </div>
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
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Name <span className="normal-case font-normal text-slate-400">(click for details)</span></th>
                  <th className="table-th text-center">Total</th>
                  <th className="table-th text-center">Pending</th>
                  <th className="table-th text-center">Completed</th>
                  <th className="table-th text-center">Revised</th>
                  <th className="table-th text-center">Delayed</th>
                  <th className="table-th">Score %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const good     = isGood(r.score);
                  const barWidth = Math.min(Math.abs(r.score), 100);
                  return (
                    <tr key={r.name} onClick={() => openDetail(r)} className="table-row cursor-pointer">
                      <td className="table-td text-xs text-slate-400 font-mono">{i + 1}</td>
                      <td className="table-td font-medium text-primary-600 hover:text-primary-800">{r.name}</td>
                      <td className="table-td text-center font-semibold text-slate-800">{r.total}</td>
                      <td className="table-td text-center font-semibold text-orange-500">{r.pending}</td>
                      <td className="table-td text-center font-semibold text-emerald-600">{r.completed}</td>
                      <td className="table-td text-center font-semibold text-amber-500">{r.revised}</td>
                      <td className="table-td text-center font-semibold text-red-500">{r.delayed}</td>
                      <td className="table-td min-w-[160px]">
                        <div className={`font-bold text-sm ${good ? 'text-emerald-600' : 'text-red-500'}`}>
                          {r.score > 0 ? '+' : ''}{r.score}%
                        </div>
                        <div className={`flex items-center gap-1 mt-0.5 text-[10px] font-medium ${good ? 'text-emerald-600' : 'text-red-500'}`}>
                          {good
                            ? <><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 12 2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Perfect</>
                            : <><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> Needs Improvement</>}
                        </div>
                        <div className="mt-1 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${good ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${barWidth}%` }} />
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

      {/* ── Detail Popup Modal ── */}
      {modal && (
        <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${isGood(modal.row.score) ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <h2 className="flex-1 text-base font-semibold text-slate-900 font-display">
                {modal.row.name} <span className="text-slate-400 font-normal">— {tab}</span>
              </h2>
              <button onClick={() => setModal(null)} className="btn-ghost w-8 h-8 !p-0 shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Score card */}
            <div className="px-6 py-4 border-b border-slate-100">
              <div className={`text-4xl font-bold mb-1 ${isGood(modal.row.score) ? 'text-emerald-600' : 'text-red-500'}`}>
                {modal.row.score > 0 ? '+' : ''}{modal.row.score}%
              </div>
              {!isGood(modal.row.score) && (
                <div className="text-xs text-amber-600 mb-2 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                  Score reduced because: {modal.row.pending} task(s) still pending
                </div>
              )}
              <div className="flex flex-wrap gap-3 mt-2">
                {[
                  { label: 'Total',     val: modal.row.total,     color: 'text-slate-700',   icon: 'clipboard' },
                  { label: 'Done',      val: modal.row.completed, color: 'text-emerald-600', icon: 'check' },
                  { label: 'Pending',   val: modal.row.pending,   color: 'text-orange-500',  icon: 'clock' },
                  { label: 'Delayed',   val: modal.row.delayed,   color: 'text-red-500',     icon: 'dot' },
                  { label: 'Revised',   val: modal.row.revised,   color: 'text-amber-500',   icon: 'refresh' },
                ].map(({ label, val, color, icon }) => (
                  <div key={label} className={`text-sm font-semibold ${color} flex items-center gap-1`}>
                    <Icon name={icon} className="w-3.5 h-3.5" /> {label}: <span className="font-bold">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-3 text-[10px] uppercase tracking-wider font-semibold text-slate-400 border-b border-slate-100">
                All Tasks in Date Range
              </div>
              {taskLoad ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  <svg className="w-5 h-5 animate-spin mx-auto mb-2 text-primary-400" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                  Loading…
                </div>
              ) : !modal.tasks?.length ? (
                <div className="p-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-2">
                    <svg className="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/></svg>
                  </div>
                  <div className="text-sm text-slate-400">No tasks found.</div>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50/95 backdrop-blur">
                    <tr>
                      <th className="table-th">#</th>
                      <th className="table-th">Description</th>
                      <th className="table-th">Assigned By</th>
                      <th className="table-th">Due Date</th>
                      <th className="table-th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modal.tasks.map((t, j) => (
                      <tr key={j} className="table-row">
                        <td className="table-td text-slate-400">{j + 1}</td>
                        <td className="table-td text-slate-700 max-w-[260px]">{t['Description']}</td>
                        <td className="table-td text-slate-500 whitespace-nowrap">{t['Assigned By'] || t['AssignedBy'] || '—'}</td>
                        <td className="table-td text-slate-500 whitespace-nowrap">{t['Due Date']}</td>
                        <td className="table-td">
                          <span className={`pill text-[10px] ${
                            t['Status'] === 'done'             ? 'bg-emerald-50 text-emerald-700' :
                            t['Status'] === 'pending'          ? 'bg-red-50 text-red-700' :
                            t['Status'] === 'revise'           ? 'bg-amber-50 text-amber-700' :
                            t['Status'] === 'revise_requested' ? 'bg-orange-50 text-orange-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {t['Status']}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setModal(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SUMMARY_TONES = ['blue', 'emerald', 'amber', 'violet', 'red'];
const SUMMARY_GRADIENTS = {
  blue:    { grad: 'linear-gradient(135deg, #D9A81F 0%, #8F6B10 100%)', shadow: 'rgba(238,188,46,0.38)' },
  emerald: { grad: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', shadow: 'rgba(16,185,129,0.35)' },
  amber:   { grad: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', shadow: 'rgba(245,158,11,0.35)' },
  violet:  { grad: 'linear-gradient(135deg, #f43f5e 0%, #7c3aed 100%)', shadow: 'rgba(244,63,94,0.35)'  },
  red:     { grad: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)', shadow: 'rgba(249,115,22,0.35)'  },
};

function SummaryKpi({ label, value, tone = 'blue' }) {
  const g = SUMMARY_GRADIENTS[tone] || SUMMARY_GRADIENTS.blue;
  return (
    <div
      className="rounded-xl p-4 relative overflow-hidden card-hover cursor-default"
      style={{ background: g.grad, boxShadow: `0 0 0 1px ${g.shadow}44, 0 4px 20px ${g.shadow}, 0 0 40px ${g.shadow}55` }}
    >
      <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }} />
      <div className="absolute -bottom-6 -left-3 w-24 h-24 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="relative z-10 min-w-0">
        <div className="text-[9.5px] font-semibold uppercase tracking-widest truncate" style={{ color: 'rgba(255,255,255,0.72)' }}>{label}</div>
        <div className="text-[26px] leading-none font-black mt-1.5 tabular-nums text-white">{value}</div>
      </div>
    </div>
  );
}

function IconTable() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>; }

'use client';
import { useState } from 'react';

const TABS = [
  { key: 'Delegation MIS', desc: 'Delegated tasks and statuses' },
  { key: 'Checklist MIS',  desc: 'Recurring checklist activity' },
  { key: 'FMS MIS',        desc: 'Campaign workflow performance' },
  { key: 'All MIS',        desc: 'Combined report across types' },
];

export default function MISPage() {
  const today = new Date().toISOString().split('T')[0];
  const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);
  const [start, setStart] = useState(lastWeek.toISOString().split('T')[0]);
  const [end, setEnd] = useState(today);
  const [tab, setTab] = useState('Delegation MIS');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    const res = await fetch(`/api/mis?start=${start}&end=${end}&type=${encodeURIComponent(tab)}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  function exportCSV() {
    if (!data || !data.rows || data.rows.length === 0) {
      alert('Generate the report first.');
      return;
    }
    const headers = Object.keys(data.rows[0]);
    const csv = [
      headers.join(','),
      ...data.rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab.replace(/\s/g, '_')}_${start}_to_${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-title">MIS Report</h1>
        <p className="page-sub">Generate management information reports across operations</p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="label">Start Date</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input !w-44" />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" value={end}   onChange={(e) => setEnd(e.target.value)}   className="input !w-44" />
          </div>
          <button onClick={generate} disabled={loading} className="btn-primary">
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                Generating…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 14 4-4 4 4 5-6"/><path d="M3 3v18h18"/></svg>
                Generate
              </>
            )}
          </button>
          <button onClick={exportCSV} className="btn-secondary">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
            Export CSV
          </button>
        </div>

        <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-100">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setData(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                tab === t.key
                  ? 'bg-primary-50 text-primary-700 border-primary-200'
                  : 'text-slate-600 hover:bg-slate-50 border-slate-200'
              }`}
            >
              {t.key}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {!data ? (
          <div className="p-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
              <svg className="w-7 h-7 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/></svg>
            </div>
            <div className="text-sm font-medium text-slate-800">No report generated yet</div>
            <div className="text-xs text-slate-500 mt-1">Select a date range and click <b>Generate</b>.</div>
          </div>
        ) : data.rows.length === 0 ? (
          <div className="p-14 text-center text-sm text-slate-500">No records in this period.</div>
        ) : (
          <>
            {data.summary && (
              <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex gap-5 text-xs flex-wrap">
                {Object.entries(data.summary).map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{k}</span>
                    <span className="text-base font-bold text-slate-900 tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    {Object.keys(data.rows[0]).map((c) => (
                      <th key={c} className="table-th">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i} className="table-row">
                      {Object.values(r).map((v, j) => <td key={j} className="table-td">{String(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

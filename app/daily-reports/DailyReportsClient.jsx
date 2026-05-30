'use client';
import { useEffect, useMemo, useState } from 'react';

const monthRange = (ym) => {
  // ym = 'YYYY-MM'
  const [y, m] = ym.split('-').map(Number);
  const from = new Date(y, m - 1, 1).toISOString().split('T')[0];
  const to = new Date(y, m, 0).toISOString().split('T')[0];
  return { from, to };
};
const curMonth = () => new Date().toISOString().slice(0, 7);
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB').replaceAll('/', '-') : '');

export default function DailyReportsClient({ isAdmin }) {
  const [month, setMonth] = useState(curMonth());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [entries, setEntries] = useState([]);
  const [q, setQ] = useState('');
  const [doer, setDoer] = useState('All');
  const [client, setClient] = useState('All');
  const [note, setNote] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/daily-tasks');
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, []);

  // active date window
  const win = useMemo(() => {
    if (from && to) return { from, to };
    return monthRange(month);
  }, [from, to, month]);

  const inWindow = useMemo(() => {
    return entries.filter((e) => {
      const d = (e.entryDate || '').split('T')[0];
      return d >= win.from && d <= win.to;
    });
  }, [entries, win]);

  const doers = useMemo(() => ['All', ...Array.from(new Set(inWindow.map((e) => e.doer))).sort()], [inWindow]);
  const clients = useMemo(() => ['All', ...Array.from(new Set(inWindow.map((e) => e.client).filter(Boolean))).sort()], [inWindow]);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return inWindow.filter((e) =>
      (doer === 'All' || e.doer === doer) &&
      (client === 'All' || e.client === client) &&
      (!t || (e.doer + e.client + e.description + e.department).toLowerCase().includes(t))
    );
  }, [inWindow, q, doer, client]);

  const perUser = useMemo(() => {
    const m = {};
    for (const e of filtered) {
      (m[e.doer] ||= { doer: e.doer, tasks: 0, minutes: 0 });
      m[e.doer].tasks += 1;
      m[e.doer].minutes += Number(e.minutes) || 0;
    }
    return Object.values(m).sort((a, b) => b.minutes - a.minutes);
  }, [filtered]);

  function downloadCSV() {
    const head = ['Date', 'Doer', 'Client', 'Department', 'Description', 'Minutes'];
    const lines = filtered.map((e) => [
      fmt(e.entryDate), e.doer, e.client || '', e.department || '',
      `"${(e.description || '').replaceAll('"', '""')}"`, e.minutes,
    ].join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daily-report-${win.from}_to_${win.to}.csv`;
    a.click();
  }

  // PDF via browser print (user picks "Save as PDF")
  const downloadPDF = () => window.print();

  function resetFilters() { setMonth(curMonth()); setFrom(''); setTo(''); setQ(''); setDoer('All'); setClient('All'); }

  return (
    <div className="space-y-4">
<div className="card p-5 space-y-4">
        {/* date controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="label !mb-0">Month</label>
          <input type="month" className="input w-auto" value={month}
            onChange={(e) => { setMonth(e.target.value); setFrom(''); setTo(''); }} />
          <span className="text-[11px] text-slate-400">OR</span>
          <label className="label !mb-0">From</label>
          <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label className="label !mb-0">To</label>
          <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn-ghost" onClick={resetFilters}>↺ Reset</button>
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary" onClick={downloadCSV}>⬇ CSV</button>
            <button className="btn-warn" onClick={downloadPDF}>⬇ PDF</button>
          </div>
        </div>

        {/* automation banners (manual + honest stub) */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[13px] font-semibold text-amber-700">📣 Daily Reminder</div>
            <div className="text-[11.5px] text-amber-700/80">
              Sends WhatsApp to the group with names of users who haven&apos;t filled today&apos;s report.
            </div>
          </div>
          <button className="btn-warn"
            onClick={() => setNote('⚠️ WhatsApp sending is not configured. Connect a provider (Twilio / WhatsApp Business API) and a scheduler to enable auto-send.')}>
            📤 Send Now
          </button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[13px] font-semibold text-slate-700">📊 Pending Task Summary</div>
            <div className="text-[11.5px] text-slate-500">
              Delegation / Checklist summary to the configured number + DMs to flagged recipients.
            </div>
          </div>
          <button className="btn-secondary"
            onClick={() => setNote('⚠️ WhatsApp sending is not configured. Connect a provider and a scheduler to enable auto-send.')}>
            📤 Send Now
          </button>
        </div>
        {note && <p className="text-[12px] text-red-500">{note}</p>}

        {/* per-user summary */}
        <div>
          <div className="text-[13px] font-semibold text-slate-800 mb-2">📊 Per-User Summary</div>
          {perUser.length === 0 ? <p className="text-[12.5px] text-slate-400">No data in range.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <th className="table-th">Doer</th><th className="table-th">Tasks</th><th className="table-th">Total Minutes</th><th className="table-th">Hours</th>
                </tr></thead>
                <tbody>
                  {perUser.map((u) => (
                    <tr key={u.doer} className="table-row">
                      <td className="table-td font-medium text-slate-800">{u.doer}</td>
                      <td className="table-td">{u.tasks}</td>
                      <td className="table-td">{u.minutes}</td>
                      <td className="table-td">{(u.minutes / 60).toFixed(1)} h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* all entries */}
        <div>
          <div className="text-[13px] font-semibold text-slate-800 mb-2">📝 All Entries</div>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <input className="input flex-1 min-w-[200px]" placeholder="🔍 Search by name / client / description…"
              value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input w-auto" value={doer} onChange={(e) => setDoer(e.target.value)}>
              {doers.map((d) => <option key={d}>{d === 'All' ? 'All Doers' : d}</option>)}
            </select>
            <select className="input w-auto" value={client} onChange={(e) => setClient(e.target.value)}>
              {clients.map((c) => <option key={c}>{c === 'All' ? 'All Clients' : c}</option>)}
            </select>
          </div>
          {filtered.length === 0 ? <p className="text-[12.5px] text-slate-400">No entries.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <th className="table-th">Date</th><th className="table-th">Doer</th><th className="table-th">Client</th>
                  <th className="table-th">Dept</th><th className="table-th">Description</th><th className="table-th">Min</th>
                </tr></thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="table-row">
                      <td className="table-td whitespace-nowrap">{fmt(e.entryDate)}</td>
                      <td className="table-td">{e.doer}</td>
                      <td className="table-td">{e.client || '—'}</td>
                      <td className="table-td">{e.department || '—'}</td>
                      <td className="table-td max-w-[360px] truncate" title={e.description}>{e.description}</td>
                      <td className="table-td">{e.minutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

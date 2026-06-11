'use client';
import { useEffect, useMemo, useState } from 'react';
import BarList from '@/app/components/BarList';

const ymd = (v) => (v ? String(v).split('T')[0].slice(0, 10) : '');
const today = () => new Date().toISOString().slice(0, 10);
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const top = (map, n = 8) => Object.entries(map).map(([name, value]) => ({ name, value: round1(value) })).sort((a, b) => b.value - a.value).slice(0, n);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB').replaceAll('/', '-') : '');

export default function DailyTaskAdminClient() {
  const [entries, setEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [doer, setDoer] = useState('All');

  useEffect(() => {
    Promise.all([
      fetch('/api/daily-tasks').then((r) => r.json()).catch(() => []),
      fetch('/api/users').then((r) => r.json()).catch(() => []),
    ]).then(([e, u]) => {
      setEntries(Array.isArray(e) ? e : []);
      setUsers(Array.isArray(u) ? u : []);
    }).finally(() => setLoading(false));
  }, []);

  const allDoers = useMemo(
    () => Array.from(new Set([...(users.map((u) => u.name)), ...entries.map((e) => e.doer)].filter(Boolean))).sort(),
    [users, entries]);

  const inRange = useMemo(() => entries.filter((e) => {
    const d = ymd(e.entryDate);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (doer !== 'All' && (e.doer || '') !== doer) return false;
    return true;
  }), [entries, from, to, doer]);

  const agg = useMemo(() => {
    const byDoer = {}, byClient = {}, byTask = {}, bySoft = {};
    let minutes = 0, revisions = 0;
    const filledToday = {};
    inRange.forEach((e) => {
      const m = parseFloat(e.minutes) || 0; minutes += m;
      if (String(e.revision).toLowerCase() === 'yes') revisions++;
      if (e.doer) byDoer[e.doer] = (byDoer[e.doer] || 0) + m;
      if (e.client) byClient[e.client] = (byClient[e.client] || 0) + m;
      const tt = e.taskType || e.department; if (tt) byTask[tt] = (byTask[tt] || 0) + m;
      if (e.software) bySoft[e.software] = (bySoft[e.software] || 0) + m;
    });
    entries.forEach((e) => { if (ymd(e.entryDate) === today() && e.doer) filledToday[e.doer.toLowerCase()] = true; });
    const notFilled = allDoers.filter((u) => !filledToday[u.toLowerCase()]);
    return {
      entries: inRange.length, minutes: round1(minutes), hours: round1(minutes / 60), revisions,
      doers: Object.keys(byDoer).length,
      byDoer: top(byDoer), byClient: top(byClient), byTask: top(byTask), bySoft: top(bySoft),
      notFilled,
    };
  }, [inRange, entries, allDoers]);

  const recent = useMemo(() => inRange.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50), [inRange]);

  function reset() { setFrom(''); setTo(''); setDoer('All'); }

  if (loading) return <div className="card p-5 text-[12.5px] text-slate-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[16px] font-semibold text-slate-900">Daily Task Admin</div>
            <div className="text-[12px] text-slate-500">Everyone&apos;s daily task submissions</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="label !mb-0">From</label>
            <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <label className="label !mb-0">To</label>
            <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
            <select className="input w-auto" value={doer} onChange={(e) => setDoer(e.target.value)}>
              <option>All</option>{allDoers.map((d) => <option key={d}>{d}</option>)}
            </select>
            <button className="btn-ghost" onClick={reset}>↺ Reset</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Kpi label="Entries" value={agg.entries} />
          <Kpi label="Total Minutes" value={agg.minutes} />
          <Kpi label="Hours" value={agg.hours} />
          <Kpi label="Revisions" value={agg.revisions} />
          <Kpi label="Active Doers" value={agg.doers} />
        </div>
      </div>

      {/* Not filled today */}
      <div className="card p-4">
        <div className="text-[13px] font-semibold text-slate-800 mb-2">⏰ Not filled today ({agg.notFilled.length})</div>
        {agg.notFilled.length === 0 ? <p className="text-[12.5px] text-emerald-600">Everyone has filled today ✓</p> : (
          <div className="flex flex-wrap gap-2">{agg.notFilled.map((n) => <span key={n} className="pill bg-rose-50 text-rose-600">{n}</span>)}</div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BarList title="Minutes by Doer" items={agg.byDoer} valueKey="value" tone="blue" icon="⏱" />
        <BarList title="Minutes by Client" items={agg.byClient} valueKey="value" tone="amber" icon="🏷" />
        <BarList title="Minutes by Task Type" items={agg.byTask} valueKey="value" tone="emerald" icon="🗂" />
        <BarList title="Minutes by Software" items={agg.bySoft} valueKey="value" tone="red" icon="💻" />
      </div>

      <div className="card p-5">
        <div className="text-[13px] font-semibold text-slate-800 mb-3">📝 Recent Entries</div>
        {recent.length === 0 ? <p className="text-[12.5px] text-slate-400">No entries.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr>{['Date','Doer','Client','Order #','Area','Task Type','Software','Rev','Min'].map((h, i) =>
                <th key={i} className="table-th">{h}</th>)}</tr></thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id} className="table-row">
                    <td className="table-td whitespace-nowrap">{fmtDate(e.entryDate)}</td>
                    <td className="table-td">{e.doer}</td>
                    <td className="table-td">{e.client || '—'}</td>
                    <td className="table-td">{e.orderNumber || '—'}</td>
                    <td className="table-td max-w-[160px] truncate" title={e.areaName}>{e.areaName || '—'}</td>
                    <td className="table-td">{e.taskType || e.department || '—'}</td>
                    <td className="table-td">{e.software || '—'}</td>
                    <td className="table-td">{String(e.revision).toLowerCase() === 'yes' ? '✅' : '—'}</td>
                    <td className="table-td">{e.minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-[18px] font-bold text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

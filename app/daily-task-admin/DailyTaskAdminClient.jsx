'use client';
import { useEffect, useMemo, useState } from 'react';
import { DonutChart, HorizBarChart } from '@/app/components/Charts';

const ymd    = (v) => (v ? String(v).split('T')[0].slice(0, 10) : '');
const today  = () => new Date().toISOString().slice(0, 10);
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB').replaceAll('/', '-') : '');
const top  = (map, n = 8) =>
  Object.entries(map)
    .map(([name, value]) => ({ name, value: round1(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);

export default function DailyTaskAdminClient() {
  const [entries, setEntries] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [doer,    setDoer]    = useState('All');

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
    if (to   && d > to)   return false;
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
      if (e.doer)   byDoer[e.doer]     = (byDoer[e.doer]     || 0) + m;
      if (e.client) byClient[e.client] = (byClient[e.client] || 0) + m;
      const tt = e.taskType || e.department; if (tt) byTask[tt] = (byTask[tt] || 0) + m;
      if (e.software) bySoft[e.software] = (bySoft[e.software] || 0) + m;
    });
    entries.forEach((e) => { if (ymd(e.entryDate) === today() && e.doer) filledToday[e.doer.toLowerCase()] = true; });
    const notFilled = allDoers.filter((u) => !filledToday[u.toLowerCase()]);
    return {
      entries: inRange.length, minutes: round1(minutes), hours: round1(minutes / 60), revisions,
      doers: Object.keys(byDoer).length,
      byDoer:   top(byDoer),
      byClient: top(byClient),
      byTask:   top(byTask),
      bySoft:   top(bySoft),
      notFilled,
    };
  }, [inRange, entries, allDoers]);

  const recent = useMemo(() =>
    inRange.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50),
    [inRange]);

  function reset() { setFrom(''); setTo(''); setDoer('All'); }

  if (loading) {
    return (
      <div className="card p-8 flex items-center justify-center gap-3">
        <div className="w-5 h-5 rounded-full border-2 border-primary-300 border-t-primary-600 animate-spin" />
        <span className="text-[13px] text-slate-500">Loading daily task data…</span>
      </div>
    );
  }

  const filledCount = allDoers.length - agg.notFilled.length;
  const fillRate    = allDoers.length > 0 ? Math.round((filledCount / allDoers.length) * 100) : 0;

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[15px] font-bold text-slate-900">Daily Task Admin</div>
            <div className="text-[12px] text-slate-500">Everyone&apos;s task submissions</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="label !mb-0 !text-[10px]">From</label>
              <input type="date" className="input !w-auto !py-1.5 !text-[12px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="label !mb-0 !text-[10px]">To</label>
              <input type="date" className="input !w-auto !py-1.5 !text-[12px]" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <select className="input !w-auto !py-1.5 !text-[12px]" value={doer} onChange={(e) => setDoer(e.target.value)}>
              <option>All</option>
              {allDoers.map((d) => <option key={d}>{d}</option>)}
            </select>
            <button className="btn-ghost !text-[12px]" onClick={reset}>↺ Reset</button>
          </div>
        </div>
      </div>

      {/* ── KPI stat cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Entries"       value={agg.entries}   icon="📋" color="#2563eb" />
        <StatCard label="Total Minutes" value={agg.minutes}   icon="⏱" color="#7c3aed" />
        <StatCard label="Hours Logged"  value={agg.hours}     icon="🕐" color="#0891b2" />
        <StatCard label="Revisions"     value={agg.revisions} icon="🔄" color="#f59e0b" />
        <StatCard label="Active Doers"  value={agg.doers}     icon="👤" color="#10b981" />
      </div>

      {/* ── Today fill status + fill rate donut ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⏰</span>
            <div>
              <div className="text-[13px] font-bold text-slate-900">Today&apos;s Fill Status</div>
              <div className="text-[11.5px] text-slate-500">{filledCount} of {allDoers.length} filled today</div>
            </div>
          </div>
          {agg.notFilled.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-600 font-semibold text-[13px] bg-emerald-50 rounded-xl px-4 py-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
              Everyone has filled today!
            </div>
          ) : (
            <div>
              <div className="text-[11.5px] font-semibold text-red-500 mb-2">{agg.notFilled.length} not filled yet:</div>
              <div className="flex flex-wrap gap-2">
                {agg.notFilled.map((n) => (
                  <span key={n} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-red-50 text-red-600 border border-red-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />{n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card p-5 flex flex-col items-center justify-center gap-2">
          <DonutChart
            value={filledCount}
            total={allDoers.length || 1}
            size={110}
            strokeColor={fillRate >= 80 ? '#10b981' : fillRate >= 50 ? '#f59e0b' : '#ef4444'}
            label="Fill Rate"
          />
          <div className="text-[11px] text-slate-500 text-center">Daily completion rate</div>
        </div>
      </div>

      {/* ── Horizontal bar charts 2×2 ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HorizBarChart
          title="Minutes by Person"
          subtitle="Time logged per employee"
          items={agg.byDoer}
          icon="👤"
          unit=" min"
        />
        <HorizBarChart
          title="Minutes by Client"
          subtitle="Client-wise time distribution"
          items={agg.byClient}
          icon="🏷"
          unit=" min"
        />
        <HorizBarChart
          title="Minutes by Task Type"
          subtitle="Work category breakdown"
          items={agg.byTask}
          icon="🗂"
          unit=" min"
        />
        <HorizBarChart
          title="Minutes by Software"
          subtitle="Tool usage distribution"
          items={agg.bySoft}
          icon="💻"
          unit=" min"
        />
      </div>

      {/* ── Recent entries table ─────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-transparent flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 grid place-items-center text-base">📝</div>
          <div>
            <div className="text-[13px] font-bold text-slate-900">Recent Entries</div>
            <div className="text-[11.5px] text-slate-500">{recent.length} records shown (up to 50)</div>
          </div>
        </div>
        {recent.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-slate-400">No entries in this range</div>
        ) : (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                <tr>
                  {['Date', 'Doer', 'Client', 'Order #', 'Area', 'Task Type', 'Software', 'Rev', 'Min'].map((h, i) => (
                    <th key={i} className="table-th whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id} className="table-row">
                    <td className="table-td whitespace-nowrap font-medium text-slate-700">{fmtDate(e.entryDate)}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-1.5">
                        <MiniAvatar name={e.doer} />
                        <span className="font-medium text-slate-800">{e.doer}</span>
                      </div>
                    </td>
                    <td className="table-td text-slate-600">{e.client || '—'}</td>
                    <td className="table-td text-slate-600">{e.orderNumber || '—'}</td>
                    <td className="table-td max-w-[140px] truncate text-slate-600" title={e.areaName}>{e.areaName || '—'}</td>
                    <td className="table-td text-slate-600">{e.taskType || e.department || '—'}</td>
                    <td className="table-td text-slate-600">{e.software || '—'}</td>
                    <td className="table-td text-center">
                      {String(e.revision).toLowerCase() === 'yes'
                        ? <span className="pill bg-amber-50 text-amber-700">Rev</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="table-td">
                      <span className="font-bold text-primary-600 tabular-nums">{e.minutes}</span>
                    </td>
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

/* ── Sub-components ─────────────────────────────────────────────────────── */
function StatCard({ label, value, icon, color }) {
  return (
    <div className="card p-4 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: color }} />
      <div className="pt-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
          <span className="text-lg leading-none">{icon}</span>
        </div>
        <div className="text-[28px] font-extrabold tabular-nums" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}

function MiniAvatar({ name = '' }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '?';
  const palette = ['from-rose-400 to-pink-600', 'from-amber-400 to-orange-600', 'from-emerald-400 to-teal-600', 'from-primary-400 to-primary-600', 'from-violet-400 to-purple-600'];
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${palette[hash % palette.length]} text-white grid place-items-center text-[8px] font-bold shrink-0`}>{ini}</div>
  );
}

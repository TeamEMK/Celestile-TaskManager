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

const DEPT_MAP = { pc: 'Process Coordinator', sales: 'Sales Person', crm: 'CRM', ea: 'Executive Assistant', sc: 'Site Engineer', runner: 'Runner', designer: 'Designer' };
const deptLabel = (d) => DEPT_MAP[(d || '').toLowerCase()] || d || 'Other';

export default function DailyTaskAdminClient() {
  const [entries, setEntries] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [doer,    setDoer]    = useState('All');
  const [activeTab, setActiveTab] = useState('overview');
  const [reminding, setReminding] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);

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
    const byDoer = {}, byClient = {}, byTask = {}, bySoft = {}, byOrder = {};
    const revByDoer = {}, revBySoft = {}, revMatrix = {};
    let minutes = 0, revisions = 0, revMinutes = 0;
    const filledToday = {};

    inRange.forEach((e) => {
      const m = parseFloat(e.minutes) || 0;
      minutes += m;

      const isRev = String(e.revision).toLowerCase() === 'yes';
      if (isRev) {
        revisions++;
        revMinutes += m;
        if (e.doer) {
          revByDoer[e.doer] = (revByDoer[e.doer] || 0) + m;
          if (!revMatrix[e.doer]) revMatrix[e.doer] = {};
          const sw = e.software || '—';
          revMatrix[e.doer][sw] = (revMatrix[e.doer][sw] || 0) + m;
        }
        if (e.software) revBySoft[e.software] = (revBySoft[e.software] || 0) + m;
      }

      if (e.doer)        byDoer[e.doer]        = (byDoer[e.doer]        || 0) + m;
      if (e.client)      byClient[e.client]     = (byClient[e.client]    || 0) + m;
      if (e.orderNumber) byOrder[e.orderNumber] = (byOrder[e.orderNumber]|| 0) + m;
      const tt = e.taskType || e.department;
      if (tt)            byTask[tt]             = (byTask[tt]            || 0) + m;
      if (e.software)    bySoft[e.software]     = (bySoft[e.software]    || 0) + m;
    });

    entries.forEach((e) => {
      if (ymd(e.entryDate) === today() && e.doer) filledToday[e.doer.toLowerCase()] = true;
    });

    const notFilled = allDoers.filter((u) => !filledToday[u.toLowerCase()]);
    const notFilledByDept = {};
    notFilled.forEach((name) => {
      const user = users.find((u) => u.name === name);
      const dept = deptLabel(user?.department || 'Other');
      (notFilledByDept[dept] ||= []).push(name);
    });

    const revSoftCols = Object.keys(revBySoft).sort((a, b) => (revBySoft[b] || 0) - (revBySoft[a] || 0));

    return {
      entries: inRange.length, minutes: round1(minutes), hours: round1(minutes / 60), revisions,
      doers: Object.keys(byDoer).length,
      byDoer:   top(byDoer),
      byClient: top(byClient),
      byTask:   top(byTask),
      bySoft:   top(bySoft),
      byOrder:  top(byOrder),
      notFilled, notFilledByDept,
      revByDoer: top(revByDoer),
      revBySoft: top(revBySoft),
      revMatrix, revSoftCols,
      revMinutes: round1(revMinutes),
    };
  }, [inRange, entries, allDoers, users]);

  const recent = useMemo(() =>
    inRange.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50),
    [inRange]);

  function reset() { setFrom(''); setTo(''); setDoer('All'); }

  async function sendReminder() {
    setReminding(true);
    setReminderResult(null);
    try {
      const res = await fetch('/api/daily-tasks/remind', { method: 'POST' });
      const data = await res.json();
      setReminderResult(data);
    } catch (e) {
      setReminderResult({ error: e.message });
    }
    setReminding(false);
  }

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

      {/* ── Tab switcher ─────────────────────────────────────────────── */}
      <div className="card px-1 overflow-hidden">
        <div className="flex border-b border-slate-100">
          {[['overview', 'Overview'], ['revisions', 'Designer Revisions']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-5 py-3 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
                activeTab === id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          OVERVIEW TAB
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* ── KPI stat cards ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Entries"       value={agg.entries}   icon="📋" grad="linear-gradient(135deg,#3b82f6,#4f46e5)" shadow="rgba(59,130,246,0.35)" />
            <StatCard label="Total Minutes" value={agg.minutes}   icon="⏱"  grad="linear-gradient(135deg,#7c3aed,#a855f7)" shadow="rgba(124,58,237,0.35)" />
            <StatCard label="Hours Logged"  value={agg.hours}     icon="🕐" grad="linear-gradient(135deg,#0891b2,#06b6d4)" shadow="rgba(8,145,178,0.35)"  />
            <StatCard label="Revisions"     value={agg.revisions} icon="🔄" grad="linear-gradient(135deg,#f59e0b,#f97316)" shadow="rgba(245,158,11,0.35)" />
            <StatCard label="Active Doers"  value={agg.doers}     icon="👤" grad="linear-gradient(135deg,#10b981,#059669)" shadow="rgba(16,185,129,0.35)" />
          </div>

          {/* ── Today fill status + donut ────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⏰</span>
                  <div>
                    <div className="text-[13px] font-bold text-slate-900">Today&apos;s Fill Status</div>
                    <div className="text-[11.5px] text-slate-500">{filledCount} of {allDoers.length} filled today</div>
                  </div>
                </div>
                {agg.notFilled.length > 0 && (
                  <button
                    onClick={sendReminder}
                    disabled={reminding}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-60"
                  >
                    {reminding ? (
                      <><div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" /> Sending…</>
                    ) : (
                      <>📲 Send WA Reminder</>
                    )}
                  </button>
                )}
              </div>

              {agg.notFilled.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-600 font-semibold text-[13px] bg-emerald-50 rounded-xl px-4 py-3">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
                  Everyone has filled today!
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(agg.notFilledByDept)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([dept, names]) => (
                      <div key={dept}>
                        <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">{dept}</div>
                        <div className="flex flex-wrap gap-2">
                          {[...names].sort().map((n) => (
                            <span key={n} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-red-50 text-red-600 border border-red-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />{n}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {reminderResult && (
                <div className={`mt-3 rounded-xl px-4 py-2.5 text-[12px] ${reminderResult.error ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                  {reminderResult.error
                    ? `Error: ${reminderResult.error}`
                    : (() => {
                        const sent    = (reminderResult.results || []).filter((r) => r.status === 'sent').length;
                        const noPhone = (reminderResult.results || []).filter((r) => r.status === 'no_phone').length;
                        const failed  = (reminderResult.results || []).filter((r) => r.status === 'failed').length;
                        return `Sent: ${sent}${noPhone ? ` · No phone: ${noPhone}` : ''}${failed ? ` · Failed: ${failed}` : ''}`;
                      })()
                  }
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

          {/* ── Bar charts ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HorizBarChart title="Minutes by Person"       subtitle="Time logged per employee"       items={agg.byDoer}   icon="👤" unit=" min" />
            <HorizBarChart title="Minutes by Client"       subtitle="Client-wise time distribution"  items={agg.byClient} icon="🏷" unit=" min" />
            <HorizBarChart title="Minutes by Task Type"    subtitle="Work category breakdown"         items={agg.byTask}   icon="🗂" unit=" min" />
            <HorizBarChart title="Minutes by Software"     subtitle="Tool usage distribution"         items={agg.bySoft}   icon="💻" unit=" min" />
            <HorizBarChart title="Minutes by Order Number" subtitle="Order-wise time distribution"    items={agg.byOrder}  icon="🔢" unit=" min" />
          </div>

          {/* ── Recent entries table ─────────────────────────────────── */}
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
      )}

      {/* ════════════════════════════════════════════════════════════════
          REVISIONS TAB
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'revisions' && (
        <div className="space-y-4">
          {/* ── Revision KPI cards ───────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Revision Entries" value={agg.revisions}          icon="🔄" grad="linear-gradient(135deg,#f59e0b,#f97316)" shadow="rgba(245,158,11,0.35)" />
            <StatCard label="Revision Minutes" value={agg.revMinutes}         icon="⏱"  grad="linear-gradient(135deg,#7c3aed,#a855f7)" shadow="rgba(124,58,237,0.35)" />
            <StatCard label="Designers Active" value={agg.revByDoer.length}   icon="👤" grad="linear-gradient(135deg,#3b82f6,#4f46e5)" shadow="rgba(59,130,246,0.35)" />
            <StatCard label="Softwares Used"   value={agg.revSoftCols.length} icon="💻" grad="linear-gradient(135deg,#10b981,#059669)" shadow="rgba(16,185,129,0.35)" />
          </div>

          {/* ── Revision bar charts ──────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HorizBarChart
              title="Revision Minutes by Designer"
              subtitle="Who spent most time on revisions"
              items={agg.revByDoer}
              icon="👤"
              unit=" min"
              color="#f59e0b"
            />
            <HorizBarChart
              title="Revision Minutes by Software"
              subtitle="Which tools are used for revisions"
              items={agg.revBySoft}
              icon="💻"
              unit=" min"
              color="#7c3aed"
            />
          </div>

          {/* ── Designer × Software matrix ───────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-amber-50/80 to-transparent flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 grid place-items-center text-base">🗂</div>
              <div>
                <div className="text-[13px] font-bold text-slate-900">Designer × Software Revision Matrix</div>
                <div className="text-[11.5px] text-slate-500">Minutes spent on revisions — per person, per tool</div>
              </div>
            </div>
            {agg.revByDoer.length === 0 ? (
              <div className="p-10 text-center text-[13px] text-slate-400">No revision entries in this date range</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                    <tr>
                      <th className="table-th whitespace-nowrap">Designer</th>
                      {agg.revSoftCols.map((sw) => (
                        <th key={sw} className="table-th whitespace-nowrap">{sw}</th>
                      ))}
                      <th className="table-th whitespace-nowrap text-amber-700">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agg.revByDoer.map(({ name, value: total }) => (
                      <tr key={name} className="table-row">
                        <td className="table-td">
                          <div className="flex items-center gap-1.5">
                            <MiniAvatar name={name} />
                            <span className="font-medium text-slate-800">{name}</span>
                          </div>
                        </td>
                        {agg.revSoftCols.map((sw) => {
                          const v = agg.revMatrix[name]?.[sw] || 0;
                          return (
                            <td key={sw} className="table-td text-center tabular-nums">
                              {v ? <span className="font-semibold text-amber-700">{round1(v)}</span> : <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                        <td className="table-td text-center">
                          <span className="font-bold text-amber-700 tabular-nums">{total}</span>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-amber-50/60">
                      <td className="table-td font-bold text-slate-700">Totals</td>
                      {agg.revSoftCols.map((sw) => {
                        const colTotal = round1(Object.values(agg.revMatrix).reduce((s, row) => s + (row[sw] || 0), 0));
                        return (
                          <td key={sw} className="table-td text-center font-bold tabular-nums text-amber-700">
                            {colTotal || '—'}
                          </td>
                        );
                      })}
                      <td className="table-td text-center font-bold text-amber-700 tabular-nums">{agg.revMinutes}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */
function StatCard({ label, value, icon, grad, shadow }) {
  return (
    <div
      className="rounded-xl p-4 relative overflow-hidden card-hover cursor-default"
      style={{ background: grad, boxShadow: `0 0 0 1px ${shadow}44, 0 4px 20px ${shadow}, 0 0 40px ${shadow}55` }}
    >
      <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full" style={{ background: 'rgba(255,255,255,0.13)' }} />
      <div className="absolute -bottom-6 -left-3 w-24 h-24 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.75)' }}>{label}</span>
          <span className="text-xl leading-none">{icon}</span>
        </div>
        <div className="text-[28px] font-black tabular-nums text-white leading-none">{value}</div>
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

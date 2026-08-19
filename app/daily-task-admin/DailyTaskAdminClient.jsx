'use client';
import { useEffect, useMemo, useState } from 'react';
import { DonutChart, HorizBarChart } from '@/app/components/Charts';
import Icon from '../components/Icon';
import { StatCard as UiStatCard } from '../components/ui';

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
  const [calMonth, setCalMonth] = useState(today().slice(0, 7)); // 'YYYY-MM'
  const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD' clicked in the calendar

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

  // ── Calendar tab: day-wise minute totals for the selected month ──────────
  // (independent of the From/To range filter above — has its own month nav)
  const calDays = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      if (doer !== 'All' && (e.doer || '') !== doer) return;
      const d = ymd(e.entryDate);
      if (!d.startsWith(calMonth)) return;
      if (!map[d]) map[d] = { minutes: 0, count: 0, doers: new Set() };
      map[d].minutes += parseFloat(e.minutes) || 0;
      map[d].count += 1;
      if (e.doer) map[d].doers.add(e.doer);
    });
    return map;
  }, [entries, doer, calMonth]);

  const calGrid = useMemo(() => {
    const [y, m] = calMonth.split('-').map(Number);
    const firstDow = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells = Array(firstDow).fill(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    return cells;
  }, [calMonth]);

  const calMonthLabel = useMemo(() => {
    const [y, m] = calMonth.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }, [calMonth]);

  const calMonthMinutes = round1(Object.values(calDays).reduce((s, d) => s + d.minutes, 0));

  const selectedDayEntries = useMemo(() => {
    if (!selectedDay) return [];
    return entries
      .filter((e) => ymd(e.entryDate) === selectedDay && (doer === 'All' || (e.doer || '') === doer))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [entries, selectedDay, doer]);

  function shiftCalMonth(delta) {
    const [y, m] = calMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDay(null);
  }

  function pickCalDay(date) {
    setSelectedDay((cur) => (cur === date ? null : date));
  }

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
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
            </div>
            <div>
              <div className="font-display text-[16px] font-semibold text-slate-900">Daily Task <span className="text-gradient-gold">Admin</span></div>
              <div className="page-sub !mt-0">Everyone&apos;s task submissions</div>
            </div>
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
            <select className="select w-auto" value={doer} onChange={(e) => setDoer(e.target.value)}>
              <option>All</option>
              {allDoers.map((d) => <option key={d}>{d}</option>)}
            </select>
            <button className="btn-ghost btn-sm" onClick={reset}><Icon name="refresh" className="w-3.5 h-3.5" /> Reset</button>
          </div>
        </div>
      </div>

      {/* ── Tab switcher ─────────────────────────────────────────────── */}
      <div className="seg">
        {[['overview', 'Overview'], ['calendar', 'Calendar'], ['revisions', 'Designer Revisions']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`seg-btn ${activeTab === id ? 'seg-btn-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          OVERVIEW TAB
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* ── KPI stat cards ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Entries"       value={agg.entries}   icon="clipboard" grad="linear-gradient(135deg,#3b82f6,#4f46e5)" shadow="rgba(59,130,246,0.35)" />
            <StatCard label="Total Minutes" value={agg.minutes}   icon="clock"  grad="linear-gradient(135deg,#7c3aed,#a855f7)" shadow="rgba(124,58,237,0.35)" />
            <StatCard label="Hours Logged"  value={agg.hours}     icon="clock" grad="linear-gradient(135deg,#0891b2,#06b6d4)" shadow="rgba(8,145,178,0.35)"  />
            <StatCard label="Revisions"     value={agg.revisions} icon="refresh" grad="linear-gradient(135deg,#f59e0b,#f97316)" shadow="rgba(245,158,11,0.35)" />
            <StatCard label="Active Doers"  value={agg.doers}     icon="user" grad="linear-gradient(135deg,#10b981,#059669)" shadow="rgba(16,185,129,0.35)" />
          </div>

          {/* ── Today fill status + donut ────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 grid place-items-center shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-slate-900">Today&apos;s Fill Status</div>
                    <div className="text-[11.5px] text-slate-500">{filledCount} of {allDoers.length} filled today</div>
                  </div>
                </div>
                {agg.notFilled.length > 0 && (
                  <button
                    onClick={sendReminder}
                    disabled={reminding}
                    className="btn relative overflow-hidden text-white hover:-translate-y-px !px-3.5 !py-2"
                    style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 55%, #047857 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.25) inset, 0 4px 14px rgba(5,150,105,0.35)' }}
                  >
                    {reminding ? (
                      <><div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" /> Sending…</>
                    ) : (
                      <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.004 2.003c-5.514 0-9.997 4.483-9.997 9.997 0 1.762.462 3.484 1.34 5.003l-1.423 5.198 5.325-1.396a9.958 9.958 0 0 0 4.755 1.21h.004c5.514 0 9.997-4.483 9.997-9.997 0-2.67-1.04-5.18-2.927-7.07a9.935 9.935 0 0 0-7.074-2.945zm5.848 15.803a8.264 8.264 0 0 1-4.256 1.17h-.003a8.297 8.297 0 0 1-4.234-1.161l-.304-.18-3.153.826.842-3.075-.198-.315a8.267 8.267 0 0 1-1.267-4.396c0-4.582 3.73-8.311 8.316-8.311a8.26 8.26 0 0 1 5.878 2.442 8.257 8.257 0 0 1 2.432 5.878c0 4.582-3.73 8.312-8.053 8.312z"/></svg> Send WA Reminder</>
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
            <HorizBarChart title="Minutes by Person"       subtitle="Time logged per employee"       items={agg.byDoer}   icon="user" unit=" min" />
            <HorizBarChart title="Minutes by Client"       subtitle="Client-wise time distribution"  items={agg.byClient} icon="tag" unit=" min" />
            <HorizBarChart title="Minutes by Task Type"    subtitle="Work category breakdown"         items={agg.byTask}   icon="folder" unit=" min" />
            <HorizBarChart title="Minutes by Software"     subtitle="Tool usage distribution"         items={agg.bySoft}   icon="laptop" unit=" min" />
            <HorizBarChart title="Minutes by Order Number" subtitle="Order-wise time distribution"    items={agg.byOrder}  icon="hash" unit=" min" />
          </div>

          {/* ── Recent entries table ─────────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 grid place-items-center text-base"><Icon name="edit" className="w-3.5 h-3.5" /></div>
              <div>
                <div className="text-[13px] font-bold text-slate-900">Recent Entries</div>
                <div className="text-[11.5px] text-slate-500">{recent.length} records shown (up to 50)</div>
              </div>
            </div>
            {recent.length === 0 ? (
              <div className="p-14 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                </div>
                <div className="text-[13.5px] font-semibold text-slate-600">No entries in this range</div>
                <div className="text-[12px] text-slate-400 mt-0.5">Try widening the date filter</div>
              </div>
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
          CALENDAR TAB — day-wise minute totals
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => shiftCalMonth(-1)}>←</button>
              <div className="text-[14px] font-bold text-slate-900 min-w-[150px] text-center">{calMonthLabel}</div>
              <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => shiftCalMonth(1)}>→</button>
              <button className="btn-ghost btn-sm" onClick={() => { setCalMonth(today().slice(0, 7)); setSelectedDay(null); }}>Today</button>
            </div>
            <div className="text-[12px] text-slate-500">
              {doer === 'All' ? 'All employees' : doer} · <span className="font-bold text-slate-800">{calMonthMinutes}</span> min this month
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-1.5 mb-3 text-[11px] text-slate-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              Tap any day to see who logged what
            </div>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-[10.5px] font-bold text-slate-400 uppercase text-center py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calGrid.map((date, i) => {
                if (!date) return <div key={'b' + i} />;
                const info = calDays[date];
                const isToday = date === today();
                const dayNum = Number(date.slice(8, 10));
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => pickCalDay(date)}
                    className={`group text-left rounded-lg border p-2 min-h-[62px] flex flex-col items-start justify-between gap-1.5 cursor-pointer transition hover:border-primary-300 hover:shadow-md hover:-translate-y-0.5 ${
                      isToday ? 'border-primary-300 bg-primary-50/40' : 'border-slate-100 bg-white'
                    }`}
                  >
                    <div className={`text-[11px] font-semibold ${isToday ? 'text-primary-700' : 'text-slate-500'}`}>{dayNum}</div>
                    {info ? (
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 tabular-nums group-hover:bg-emerald-100">
                        {round1(info.minutes)}m
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300">no entries</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Calendar day detail modal ───────────────────────────────── */}
      {activeTab === 'calendar' && selectedDay && (
        <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={() => setSelectedDay(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 grid place-items-center text-lg shrink-0"><Icon name="calendar" className="w-3.5 h-3.5" /></div>
                <div>
                  <div className="text-[15px] font-bold text-slate-900">{fmtDate(selectedDay)}</div>
                  <div className="text-[12px] text-slate-500">
                    {selectedDayEntries.length} entr{selectedDayEntries.length === 1 ? 'y' : 'ies'}
                    {doer === 'All' ? '' : ` · ${doer}`}
                    {selectedDayEntries.length > 0 && ` · ${round1(selectedDayEntries.reduce((s, e) => s + (parseFloat(e.minutes) || 0), 0))} min total`}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedDay(null)} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {selectedDayEntries.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                </div>
                <div className="text-[13.5px] font-semibold text-slate-600">No one logged anything this day</div>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
                {selectedDayEntries.map((e) => (
                  <div key={e.id} className="px-6 py-3 flex items-start gap-3">
                    <MiniAvatar name={e.doer} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-[13px]">{e.doer}</span>
                        {String(e.revision).toLowerCase() === 'yes' && <span className="pill bg-amber-50 text-amber-700">Revision</span>}
                        <span className="ml-auto font-bold text-primary-600 tabular-nums text-[13px]">{e.minutes} min</span>
                      </div>
                      <div className="text-[12px] text-slate-500 mt-0.5">
                        {[e.taskType || e.department, e.software, e.client, e.orderNumber, e.areaName].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                  </div>
                ))}
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
            <StatCard label="Revision Entries" value={agg.revisions}          icon="refresh" grad="linear-gradient(135deg,#f59e0b,#f97316)" shadow="rgba(245,158,11,0.35)" />
            <StatCard label="Revision Minutes" value={agg.revMinutes}         icon="clock"  grad="linear-gradient(135deg,#7c3aed,#a855f7)" shadow="rgba(124,58,237,0.35)" />
            <StatCard label="Designers Active" value={agg.revByDoer.length}   icon="user" grad="linear-gradient(135deg,#3b82f6,#4f46e5)" shadow="rgba(59,130,246,0.35)" />
            <StatCard label="Softwares Used"   value={agg.revSoftCols.length} icon="laptop" grad="linear-gradient(135deg,#10b981,#059669)" shadow="rgba(16,185,129,0.35)" />
          </div>

          {/* ── Revision bar charts ──────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HorizBarChart
              title="Revision Minutes by Designer"
              subtitle="Who spent most time on revisions"
              items={agg.revByDoer}
              icon=""
              unit=" min"
              color="#f59e0b"
            />
            <HorizBarChart
              title="Revision Minutes by Software"
              subtitle="Which tools are used for revisions"
              items={agg.revBySoft}
              icon=""
              unit=" min"
              color="#7c3aed"
            />
          </div>

          {/* ── Designer × Software matrix ───────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-amber-50/50 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 grid place-items-center text-base"><Icon name="folder" className="w-3.5 h-3.5" /></div>
              <div>
                <div className="text-[13px] font-bold text-slate-900">Designer × Software Revision Matrix</div>
                <div className="text-[11.5px] text-slate-500">Minutes spent on revisions — per person, per tool</div>
              </div>
            </div>
            {agg.revByDoer.length === 0 ? (
              <div className="p-14 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 grid place-items-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/></svg>
                </div>
                <div className="text-[13.5px] font-semibold text-slate-600">No revision entries in this date range</div>
                <div className="text-[12px] text-slate-400 mt-0.5">Nothing to show here yet</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                    <tr>
                      <th className="table-th whitespace-nowrap">Designer</th>
                      {agg.revSoftCols.map((sw) => (
                        <th key={sw} className="table-th whitespace-nowrap">{sw}</th>
                      ))}
                      <th className="table-th whitespace-nowrap !text-amber-300">Total</th>
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

// Call sites still pass the old `grad`/`shadow` pair; `grad` now only decides
// which accent rail the shared neutral card gets, so this page's stat row
// didn't have to be rewritten to lose its gradients.
const TONE_BY_HUE = [
  ['#D9A81F', 'gold'], ['#8F6B10', 'gold'],
  ['#10b981', 'emerald'], ['#059669', 'emerald'],
  ['#f59e0b', 'amber'], ['#f97316', 'amber'],
  ['#ef4444', 'red'], ['#dc2626', 'red'],
  ['#7c3aed', 'violet'], ['#a855f7', 'violet'],
  ['#3b82f6', 'blue'], ['#4f46e5', 'blue'],
  ['#0891b2', 'teal'], ['#06b6d4', 'teal'],
];
function toneFromGrad(grad = '') {
  const hit = TONE_BY_HUE.find(([hex]) => String(grad).includes(hex));
  return hit ? hit[1] : 'slate';
}

function StatCard({ label, value, icon, grad }) {
  return <UiStatCard label={label} value={value} icon={icon} tone={toneFromGrad(grad)} />;
}

function MiniAvatar({ name = '' }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '?';
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <div className={`w-5 h-5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 grid place-items-center text-[8px] font-semibold shrink-0`}>{ini}</div>
  );
}

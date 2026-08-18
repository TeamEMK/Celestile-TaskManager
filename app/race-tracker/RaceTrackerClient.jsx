'use client';
import { useMemo, useState } from 'react';
import Icon from '../components/Icon';

const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };

// medal colors for top 3 — gold / silver / bronze
const MEDAL = [
  'bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-[0_0_0_1px_rgba(217,158,26,0.3),0_4px_12px_rgba(217,158,26,0.35)]',
  'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 shadow-[0_0_0_1px_rgba(148,163,184,0.3),0_4px_12px_rgba(148,163,184,0.3)]',
  'bg-gradient-to-br from-orange-300 to-orange-500 text-white shadow-[0_0_0_1px_rgba(234,124,38,0.3),0_4px_12px_rgba(234,124,38,0.3)]',
];
const CAR_TAG = [
  'bg-gradient-to-br from-amber-300 to-amber-500 text-white',
  'bg-gradient-to-br from-slate-300 to-slate-500 text-white',
  'bg-gradient-to-br from-orange-300 to-orange-500 text-white',
];

export default function RaceTrackerClient({ delegations = [], users = [] }) {
  const [from, setFrom] = useState(daysAgo(2));
  const [to, setTo] = useState(todayISO());
  const [started, setStarted] = useState(true); // show by default

  const rows = useMemo(() => {
    if (!started) return [];
    const fromD = new Date(from); fromD.setHours(0, 0, 0, 0);
    const toD = new Date(to); toD.setHours(23, 59, 59, 999);

    // bucket by doer
    const m = {};
    for (const d of delegations) {
      const created = new Date(d.createdAt || d.dueDate || 0);
      if (created < fromD || created > toD) continue;
      const key = d.doer || 'Unknown';
      if (!m[key]) m[key] = { doer: key, doerId: d.doerId, total: 0, done: 0, pending: 0, revised: 0 };
      m[key].total += 1;
      if (d.status === 'done') m[key].done += 1;
      else if (d.status === 'revise') { m[key].pending += 1; m[key].revised += 1; }
      else m[key].pending += 1;
    }

    // attach department from users for sub-label
    const userMap = Object.fromEntries(users.map((u) => [u.name, u]));

    // score: done minus pending minus revised. 0 or above => finished.
    const list = Object.values(m).map((r) => {
      const score = r.done - r.pending - r.revised;
      const finished = r.pending === 0 && r.revised === 0 && r.total > 0;
      // position on track: -100 (start) → 0 (finish). clamp score into that range.
      const trackPos = Math.max(-100, Math.min(0, score));
      const pct = ((trackPos + 100) / 100) * 100;             // 0..100 along the lane
      const behind = finished ? 0 : Math.max(0, -score);
      return {
        ...r, score, finished, pct,
        behindLabel: finished ? 'Finished ' : `${behind.toFixed(1)} behind`,
        pctLabel: finished ? '0.0%' : `${(100 - pct).toFixed(1)}%`,
        department: userMap[r.doer]?.department || '',
      };
    });

    // rank by score desc (then by done desc)
    list.sort((a, b) => (b.score - a.score) || (b.done - a.done));
    return list;
  }, [started, from, to, delegations, users]);

  const initials = (name) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="page-title">Race Tracker</h1>
        <p className="page-sub">See who's ahead this week — ranked by tasks done vs. pending.</p>
      </div>

      <div className="card p-5">
        <div className="flex items-end gap-3 flex-wrap">
          <div><label className="label">Start Date</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label">End Date</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn-primary" onClick={() => setStarted(true)}>
            <IconFlag /> Start Race
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-14 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
            <IconFlagLarge />
          </div>
          <div className="text-[13.5px] font-semibold text-slate-700">
            {started ? 'No data in selected date range' : 'Ready to race'}
          </div>
          <div className="text-[12px] text-slate-500 mt-0.5">
            {started ? 'Try widening the date range above.' : 'Select a date range and click Start Race.'}
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-gradient-to-r from-slate-50/80 to-transparent">
            <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center"><IconTrophy /></div>
            <div>
              <h2 className="text-[13.5px] font-semibold text-slate-900">Leaderboard</h2>
              <p className="text-[11.5px] text-slate-500">{rows.length} racer{rows.length === 1 ? '' : 's'} · {from} to {to}</p>
            </div>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-4 px-2">
              <span className="text-red-500 inline-flex items-center gap-1"><Icon name="chevronRight" className="w-3 h-3" /> START · −100</span>
              <span className="hidden sm:inline">Score: lower → behind · higher → ahead</span>
              <span className="text-emerald-600">0 · FINISH <Icon name="flag" className="w-3.5 h-3.5" /></span>
            </div>

            <div className="space-y-3 overflow-x-auto">
              {rows.map((r, i) => (
                <div key={r.doer} className="card-hover grid grid-cols-[auto_minmax(140px,200px)_1fr_auto] items-center gap-3 rounded-xl p-2 -m-2 sm:p-0 sm:m-0 transition-colors hover:bg-primary-50/30 min-w-[560px]">
                  {/* medal / rank */}
                  <div className={`w-9 h-9 rounded-full grid place-items-center font-bold text-[13px] transition-transform duration-200
                    ${i < 3 ? MEDAL[i] : 'bg-slate-100 text-slate-600'}`}>
                    {i + 1}
                  </div>

                  {/* name + dept */}
                  <div className="min-w-0">
                    <div className="font-semibold text-[13.5px] text-slate-800 truncate">{r.doer}</div>
                    {r.department && <div className="text-[11px] text-slate-500 truncate">{r.department}</div>}
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <span className="pill bg-primary-50 text-primary-700">{r.total} total</span>
                      <span className="pill bg-emerald-50 text-emerald-600">{r.done} done</span>
                      {r.pending > 0 && <span className="pill bg-amber-50 text-amber-600">{r.pending} pending</span>}
                      {r.revised > 0 && <span className="pill bg-red-50 text-red-600">{r.revised} revised</span>}
                    </div>
                  </div>

                  {/* lane */}
                  <div className="relative h-10 bg-emerald-100/40 rounded-lg border-2 border-emerald-200 overflow-hidden">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_22px,rgba(255,255,255,0.6)_22px_28px)]" />
                    <div className="absolute right-0 top-0 bottom-0 w-2 bg-gradient-to-r from-transparent to-emerald-500" />
                    {/* car */}
                    <div className="absolute top-1/2 -translate-y-1/2 transition-all duration-700"
                      style={{ left: `calc(${r.pct}% - 26px)` }}>
                      <div className="flex flex-col items-center">
                        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md mb-0.5 shadow-sm
                          ${i < 3 ? CAR_TAG[i] : 'bg-emerald-500 text-white'}`}>
                          {initials(r.doer)}
                        </div>
                        <span className="text-[18px] leading-none"><Icon name="car" className="w-3.5 h-3.5" /></span>
                      </div>
                    </div>
                  </div>

                  {/* stats right */}
                  <div className="text-right min-w-[88px]">
                    <div className={`text-[15px] font-bold ${r.finished ? 'text-emerald-600' : 'text-slate-700'}`}>{r.pctLabel}</div>
                    <div className="text-[10.5px] text-slate-500">{r.behindLabel}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconFlag() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V4"/><path d="M4 4h14l-2 4 2 4H4"/></svg>; }
function IconFlagLarge() { return <svg className="w-7 h-7 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V4"/><path d="M4 4h14l-2 4 2 4H4"/></svg>; }
function IconTrophy() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M6 5h12v6a6 6 0 0 1-12 0z"/><path d="M9 21h6M12 17v4"/></svg>; }

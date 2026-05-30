'use client';
import { useMemo, useState } from 'react';

const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };

// medal colors for top 3
const MEDAL = ['bg-amber-400 text-white', 'bg-slate-300 text-slate-700', 'bg-orange-300 text-white'];

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
        behindLabel: finished ? 'Finished 🏁' : `${behind.toFixed(1)} behind`,
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
    <div className="space-y-4">
<div className="card p-5">
        <div className="flex items-end gap-3 flex-wrap">
          <div><label className="label">Start Date</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label">End Date</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn-primary" onClick={() => setStarted(true)}>Start Race</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-[13px] text-slate-400">
          {started ? 'No data in selected date range.' : 'Select a date range and click Start Race.'}
        </div>
      ) : (
        <div className="card p-5">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-4 px-2">
            <span className="text-red-500">▶ START · −100</span>
            <span>Score: lower → behind · higher → ahead</span>
            <span className="text-emerald-600">0 · FINISH 🏁</span>
          </div>

          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={r.doer} className="grid grid-cols-[auto_minmax(160px,220px)_1fr_auto] items-center gap-3">
                {/* medal / rank */}
                <div className={`w-9 h-9 rounded-full grid place-items-center font-bold text-[13px]
                  ${i < 3 ? MEDAL[i] : 'bg-slate-100 text-slate-600'}`}>
                  {i + 1}
                </div>

                {/* name + dept */}
                <div className="min-w-0">
                  <div className="font-semibold text-[13.5px] text-slate-800 truncate">{r.doer}</div>
                  {r.department && <div className="text-[11px] text-slate-500 truncate">{r.department}</div>}
                  <div className="flex gap-1 mt-1">
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
                      <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md mb-0.5
                        ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-400 text-white' : i === 2 ? 'bg-orange-400 text-white' : 'bg-emerald-500 text-white'}`}>
                        {initials(r.doer)}
                      </div>
                      <span className="text-[18px] leading-none">🚗</span>
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
      )}
    </div>
  );
}

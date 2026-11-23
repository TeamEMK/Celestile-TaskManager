'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Icon from '../components/Icon';
import { usePaged, Pager } from '../components/Pager';

// The "Sheet view" and "Reports" tabs of an FMS on Live Tracking (23-11-2026).
// Both read /api/live-tracking/fms-<id>?view=sheet (lib/fmsSheet.js
// getFmsSheetGrid): every entry with, per step, Planned / Actual / Doer and
// each checklist field the step asks for — what the sheet itself holds.

// "23/11/2026 15:34:00" (the sheets' own format, IST) → ms, or null.
function toMs(val) {
  const m = String(val ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0', s = '0'] = m;
  const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - 5.5 * 3600 * 1000;
  return Number.isNaN(t) ? null : t;
}
const dayStart = (iso) => (iso ? Date.parse(`${iso}T00:00:00+05:30`) : null);
const dayEnd = (iso) => (iso ? Date.parse(`${iso}T23:59:59+05:30`) : null);

// Where one step of one entry stands.
function cellState(row, st, now) {
  const plan = row[st.plan], actual = row[st.actual];
  if (!plan) return 'none';
  const p = toMs(plan);
  if (actual) {
    const a = toMs(actual);
    return p && a && a > p ? 'late' : 'ontime';
  }
  return p && now > p ? 'overdue' : 'pending';
}

// H… Hyderabad, B… Bangalore — off the order / lead number.
function branchOf(row, idx) {
  const v = String(row[idx] ?? '').trim().toUpperCase();
  return v.startsWith('H') ? 'Hyderabad' : v.startsWith('B') ? 'Bangalore' : '';
}

const YES = /^(yes|y|ok|done|completed|approved|pass|received)$/i;
const NO = /^(no|n|not ok|fail|failed|rejected|reschedule|pending)$/i;
const isUrl = (v) => /^https?:\/\//i.test(String(v || ''));

function Value({ v }) {
  const s = String(v ?? '').trim();
  if (!s) return <span className="text-slate-300">—</span>;
  if (isUrl(s)) {
    const links = s.split(/\s+/).filter(isUrl);
    return <span className="inline-flex flex-wrap gap-1">{links.map((u, i) => (
      <a key={i} href={u} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline inline-flex items-center gap-0.5">
        <Icon name="file" className="w-3 h-3" />Open{links.length > 1 ? ` ${i + 1}` : ''}
      </a>))}</span>;
  }
  if (YES.test(s)) return <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">{s}</span>;
  if (NO.test(s)) return <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-medium">{s}</span>;
  return <>{s}</>;
}

const STATE_CLS = {
  ontime: 'bg-emerald-50 text-emerald-800',
  late: 'bg-amber-50 text-amber-800',
  overdue: 'bg-rose-50 text-rose-700 font-semibold',
  pending: 'bg-sky-50 text-sky-800',
  none: '',
};

export default function FmsSheetPanel({ id, mode }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setLoading(true); setErr('');
    fetch(`/api/live-tracking/${id}?view=sheet`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Failed to load the sheet');
      setData(d);
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { setData(null); load(); }, [load]);

  // Filters shared by both tabs.
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const keyIdx = useMemo(() => (data?.headers || []).slice(0, data?.ownCount || 0)
    .findIndex((h) => /order\s*(no|number|#)|lead\s*(id|no)|enquiry\s*(id|no)/i.test(h)), [data]);
  const dateIdx = useMemo(() => {
    if (!data) return -1;
    for (let i = 0; i < data.ownCount; i++) {
      if (/time\s*stamp|date/i.test(data.headers[i]) && data.rows.some((r) => toMs(r[i]))) return i;
    }
    return -1;
  }, [data]);
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const f = dayStart(from), t = dayEnd(to);
    return data.rows.filter((r) => {
      if (branch && keyIdx >= 0 && branchOf(r, keyIdx) !== branch) return false;
      if ((f || t) && dateIdx >= 0) {
        const ms = toMs(r[dateIdx]);
        if (!ms || (f && ms < f) || (t && ms > t)) return false;
      }
      return !needle || r.some((c) => String(c).toLowerCase().includes(needle));
    });
  }, [data, q, branch, from, to, keyIdx, dateIdx]);

  if (err) return <div className="card p-4 text-[12.5px] text-red-600">{err} <button className="btn-secondary btn-sm ml-2" onClick={load}>Retry</button></div>;
  if (!data) return <div className="card p-6 text-center text-[12.5px] text-slate-500">Loading the sheet…</div>;

  const filterBar = (
    <div className="card p-3 flex flex-wrap items-end gap-2.5 text-[12px]">
      <label className="flex flex-col gap-1 min-w-[200px] flex-1">
        <span className="text-slate-500">Search</span>
        <input className="input !py-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order, client, value…" />
      </label>
      {keyIdx >= 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Branch</span>
          <select className="input !py-1.5" value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All</option><option>Hyderabad</option><option>Bangalore</option>
          </select>
        </label>
      )}
      {dateIdx >= 0 && (<>
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">{data.headers[dateIdx]} from</span>
          <input type="date" className="input !py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">to</span>
          <input type="date" className="input !py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </>)}
      {(q || branch || from || to) && <button className="btn-secondary btn-sm" onClick={() => { setQ(''); setBranch(''); setFrom(''); setTo(''); }}>Clear</button>}
      <span className="ml-auto text-slate-500">{rows.length.toLocaleString()} of {data.rows.length.toLocaleString()} entries</span>
      <button className="btn-secondary btn-sm" onClick={load} disabled={loading}><Icon name="refresh" className="w-3.5 h-3.5" /> {loading ? 'Loading…' : 'Refresh'}</button>
    </div>
  );

  return (
    <div className="space-y-3">
      {filterBar}
      {mode === 'sheet' ? <SheetGrid data={data} rows={rows} /> : <Reports data={data} rows={rows} />}
    </div>
  );
}

/* ── Sheet view ──────────────────────────────────────────────────── */

function SheetGrid({ data, rows }) {
  const [hidden, setHidden] = useState(() => new Set());
  const steps = data.steps;
  const visible = steps.filter((_, i) => !hidden.has(i));
  const cols = [
    ...Array.from({ length: data.ownCount }, (_, i) => ({ idx: i })),
    ...visible.flatMap((st) => Array.from({ length: st.span }, (_, k) => ({ idx: st.start + k, st, first: k === 0 }))),
  ];
  const pager = usePaged(rows, { pageSize: 50, resetKey: [rows.length, hidden.size] });
  const now = data.now || Date.now();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
        <span className="text-slate-500 mr-1">Steps:</span>
        {steps.map((st, i) => {
          const on = !hidden.has(i);
          return (
            <button key={i} type="button"
              onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
              className={`px-2.5 py-1 rounded-full border ${on ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-slate-200 text-slate-400 line-through'}`}>
              {st.name}
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-3 text-slate-500">
          <Swatch cls="bg-emerald-100" label="Done on time" />
          <Swatch cls="bg-amber-100" label="Done late" />
          <Swatch cls="bg-sky-100" label="Pending" />
          <Swatch cls="bg-rose-100" label="Overdue" />
        </span>
      </div>
      <div className="card p-0 overflow-auto max-h-[72vh]">
        <table className="text-[12px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th colSpan={data.ownCount} className="bg-slate-100 border border-slate-200 px-2 py-1 text-left text-slate-600">Entry</th>
              {visible.map((st) => (
                <th key={st.start} colSpan={st.span} className="bg-primary-50 border border-slate-200 px-2 py-1 text-left text-primary-800 whitespace-nowrap">{st.name}</th>
              ))}
            </tr>
            <tr>
              {cols.map((c) => (
                <th key={c.idx} className={`bg-slate-50 border border-slate-200 px-2 py-1 text-left font-medium text-slate-600 whitespace-nowrap ${c.first ? 'border-l-2 border-l-primary-300' : ''}`}>
                  {data.headers[c.idx]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((row, ri) => {
              const states = new Map(visible.map((st) => [st.start, cellState(row, st, now)]));
              return (
                <tr key={ri} className="hover:bg-slate-50/60">
                  {cols.map((c) => {
                    const st = c.st;
                    const state = st ? states.get(st.start) : null;
                    const tint = st && (c.idx === st.plan || c.idx === st.actual) ? STATE_CLS[state] : '';
                    return (
                      <td key={c.idx} className={`border border-slate-100 px-2 py-1 align-top max-w-[260px] ${tint} ${c.first ? 'border-l-2 border-l-primary-200' : ''}`}
                        style={{ overflowWrap: 'anywhere' }}>
                        {st && c.idx === st.actual && !row[c.idx] && state === 'overdue'
                          ? <span className="text-rose-600">Overdue</span>
                          : <Value v={row[c.idx]} />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && <Pager {...pager} noun="entry" />}
    </div>
  );
}

function Swatch({ cls, label }) {
  return <span className="inline-flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />{label}</span>;
}

/* ── Reports ─────────────────────────────────────────────────────── */

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

function Reports({ data, rows }) {
  const now = data.now || Date.now();
  const report = useMemo(() => {
    const steps = data.steps.map((st) => {
      const c = { reached: 0, ontime: 0, late: 0, pending: 0, overdue: 0 };
      const byDoer = new Map();
      const answers = st.fields.map((f) => ({ f, counts: new Map(), filled: 0 }));
      for (const r of rows) {
        const s = cellState(r, st, now);
        if (s === 'none') continue;
        c.reached++; c[s]++;
        const doers = String(r[st.doer] || '').split(',').map((x) => x.trim()).filter(Boolean);
        for (const d of (doers.length ? doers : ['(unassigned)'])) {
          if (!byDoer.has(d)) byDoer.set(d, { ontime: 0, late: 0, pending: 0, overdue: 0 });
          byDoer.get(d)[s]++;
        }
        for (const a of answers) {
          const v = String(r[a.f.idx] ?? '').trim();
          if (!v) continue;
          a.filled++;
          a.counts.set(v, (a.counts.get(v) || 0) + 1);
        }
      }
      // Choice-like answers only (Yes/No, a status) — a date, a link or free
      // text has as many values as rows and says nothing as a count.
      const choice = answers.filter((a) => a.filled && !['date', 'upload', 'link', 'number'].includes(a.f.type)
        && a.counts.size <= 12 && a.counts.size < Math.max(3, a.filled));
      return { st, ...c, done: c.ontime + c.late, byDoer, choice };
    });
    const doers = new Map();
    for (const s of steps) {
      for (const [d, v] of s.byDoer) {
        if (!doers.has(d)) doers.set(d, { name: d, ontime: 0, late: 0, pending: 0, overdue: 0, steps: [] });
        const t = doers.get(d);
        for (const k of ['ontime', 'late', 'pending', 'overdue']) t[k] += v[k];
        t.steps.push({ name: s.st.name, ...v });
      }
    }
    return { steps, doers: [...doers.values()].sort((a, b) => (b.overdue - a.overdue) || a.name.localeCompare(b.name)) };
  }, [data, rows, now]);

  const top = report.steps[0]?.reached || rows.length || 1;
  const [openDoer, setOpenDoer] = useState('');

  return (
    <div className="space-y-4">
      {/* Step-wise funnel */}
      <div className="card p-0 overflow-auto">
        <div className="px-4 py-2.5 border-b border-slate-100 text-[13px] font-semibold text-slate-800">Step-wise report</div>
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-left text-slate-500 bg-slate-50">
            <th className="px-3 py-2">Step</th><th className="px-3 py-2 w-[28%]">Reached</th>
            <th className="px-3 py-2 text-right">Done</th><th className="px-3 py-2 text-right">On time</th>
            <th className="px-3 py-2 text-right">Late</th><th className="px-3 py-2 text-right">Pending</th>
            <th className="px-3 py-2 text-right">Overdue</th><th className="px-3 py-2 text-right">On-time %</th>
          </tr></thead>
          <tbody>
            {report.steps.map((s) => (
              <tr key={s.st.start} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800">{s.st.name}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 rounded bg-primary-400" style={{ width: `${Math.max(2, (s.reached / top) * 100)}%` }} />
                    <span className="tabular-nums text-slate-600">{s.reached}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.done}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{s.ontime}</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700">{s.late}</td>
                <td className="px-3 py-2 text-right tabular-nums text-sky-700">{s.pending}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${s.overdue ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{s.overdue}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(s.ontime, s.done)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Person-wise */}
      <div className="card p-0 overflow-auto">
        <div className="px-4 py-2.5 border-b border-slate-100 text-[13px] font-semibold text-slate-800">
          Person-wise report <span className="font-normal text-slate-400 text-[11.5px]">· click a name for the step-wise split</span>
        </div>
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-left text-slate-500 bg-slate-50">
            <th className="px-3 py-2">Doer</th><th className="px-3 py-2 text-right">Done</th>
            <th className="px-3 py-2 text-right">On time</th><th className="px-3 py-2 text-right">Late</th>
            <th className="px-3 py-2 text-right">Pending</th><th className="px-3 py-2 text-right">Overdue</th>
            <th className="px-3 py-2 text-right">On-time %</th>
          </tr></thead>
          <tbody>
            {report.doers.map((d) => {
              const open = openDoer === d.name;
              const line = (x, key, sub) => (
                <tr key={key} className={sub ? 'bg-slate-50/70 text-[12px]' : 'border-t border-slate-100 cursor-pointer hover:bg-slate-50'}
                  onClick={sub ? undefined : () => setOpenDoer(open ? '' : d.name)}>
                  <td className={`px-3 py-1.5 ${sub ? 'pl-8 text-slate-600' : 'font-medium text-slate-800'}`}>
                    {!sub && <span className="text-slate-400 mr-1">{open ? '▾' : '▸'}</span>}{sub ? x.name : d.name}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{x.ontime + x.late}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{x.ontime}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">{x.late}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-sky-700">{x.pending}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${x.overdue ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{x.overdue}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{pct(x.ontime, x.ontime + x.late)}</td>
                </tr>
              );
              return [line(d, d.name, false), ...(open ? d.steps.map((s) => line(s, `${d.name}|${s.name}`, true)) : [])];
            })}
            {!report.doers.length && <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400">No steps reached for these entries.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Checklist answers */}
      {report.steps.some((s) => s.choice.length) && (
        <div className="space-y-2">
          <div className="text-[13px] font-semibold text-slate-800">Checklist answers</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.steps.flatMap((s) => s.choice.map((a) => (
              <div key={`${s.st.start}-${a.f.idx}`} className="card p-3 space-y-1.5">
                <div className="text-[11px] text-slate-400">{s.st.name}</div>
                <div className="text-[12.5px] font-medium text-slate-800">{a.f.label} <span className="text-slate-400 font-normal">· {a.filled} answered</span></div>
                {[...a.counts].sort((x, y) => y[1] - x[1]).map(([v, n]) => (
                  <div key={v} className="flex items-center gap-2 text-[12px]">
                    <span className="w-28 truncate text-slate-600" title={v}>{v}</span>
                    <div className="flex-1 h-2 rounded bg-slate-100">
                      <div className={`h-2 rounded ${YES.test(v) ? 'bg-emerald-400' : NO.test(v) ? 'bg-rose-400' : 'bg-primary-400'}`} style={{ width: `${(n / a.filled) * 100}%` }} />
                    </div>
                    <span className="tabular-nums text-slate-700 w-16 text-right">{n} · {pct(n, a.filled)}</span>
                  </div>
                ))}
              </div>
            )))}
          </div>
        </div>
      )}
    </div>
  );
}

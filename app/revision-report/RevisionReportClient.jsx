'use client';
import { useEffect, useMemo, useState } from 'react';

// Design revision report: how many times each designer's work was sent back,
// and how many times each order was revised — by the internal review
// (designer mistake) or by the CRM (revision requested). First a weekly view
// for the 02-11-2026 meeting; per designer / per order with a month and
// all-time range asked for 03-11-2026. Rows come from lib/revisions.js,
// logged on every send-back.

const IST_MS = 330 * 60 * 1000;
const DAY_MS = 86400000;

// Monday 00:00 IST of the week holding `ms`, as a UTC epoch.
function weekStart(ms) {
  const ist = new Date(ms + IST_MS);
  const dow = (ist.getUTCDay() + 6) % 7; // Mon = 0
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow) - IST_MS;
}
// 1st of the month holding `ms`, 00:00 IST, shifted by `add` months.
function monthStart(ms, add = 0) {
  const ist = new Date(ms + IST_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + add, 1) - IST_MS;
}
const fmtDay = (ms) => new Date(ms + IST_MS).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtMonth = (ms) => new Date(ms + IST_MS).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtWhen = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t + IST_MS).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
};

// The [from, to) window for a period, `offset` steps back from now.
function windowFor(period, offset) {
  const now = Date.now();
  if (period === 'week') { const s = weekStart(now) - offset * 7 * DAY_MS; return [s, s + 7 * DAY_MS]; }
  if (period === 'month') return [monthStart(now, -offset), monthStart(now, 1 - offset)];
  return [-Infinity, Infinity];
}

function tally(rows, keyOf, extra = () => ({})) {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyOf(r) || '—';
    const t = map.get(k) || { key: k, Designer: 0, CRM: 0, total: 0, orders: new Set(), designers: new Set(), stages: new Set(), last: '', ...extra(r) };
    t[r.source === 'CRM' ? 'CRM' : 'Designer']++;
    t.total++;
    if (r.order_no) t.orders.add(r.order_no);
    if (r.designer) t.designers.add(r.designer);
    if (r.stage) t.stages.add(r.stage);
    if (String(r.created_at) > t.last) t.last = r.created_at;
    map.set(k, t);
  });
  return [...map.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

export default function RevisionReportClient() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [period, setPeriod] = useState('week');
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  // Clicking a designer or an order narrows the list below to it.
  const [pick, setPick] = useState(null); // { kind: 'designer' | 'order', key }

  useEffect(() => {
    fetch('/api/revisions').then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setRows(d) : setErr(d.error || 'Failed to load revisions')))
      .catch((e) => setErr(e.message));
  }, []);

  const [from, to] = windowFor(period, offset);
  const inRange = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((r) => {
      const at = Date.parse(r.created_at);
      if (!(at >= from && at < to)) return false;
      return !t || [r.order_no, r.client, r.designer, r.stage, r.remarks, r.raised_by].some((v) => String(v || '').toLowerCase().includes(t));
    });
  }, [rows, from, to, q]);

  const byDesigner = useMemo(() => tally(inRange, (r) => r.designer), [inRange]);
  const byOrder = useMemo(() => tally(inRange, (r) => r.order_no, (r) => ({ client: r.client || '' })), [inRange]);
  const listed = pick
    ? inRange.filter((r) => (pick.kind === 'designer' ? (r.designer || '—') : (r.order_no || '—')) === pick.key)
    : inRange;

  const designerCount = inRange.filter((r) => r.source !== 'CRM').length;
  const crmCount = inRange.length - designerCount;
  const label = period === 'week' ? `${fmtDay(from)} – ${fmtDay(to - DAY_MS)}` : period === 'month' ? fmtMonth(from) : 'All time';
  const choose = (p) => { setPeriod(p); setOffset(0); setPick(null); };
  const togglePick = (kind, key) => setPick((p) => (p && p.kind === kind && p.key === key ? null : { kind, key }));

  return (
    <div className="space-y-3">
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="section-title">Design Revision Report</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Every time design work was sent back — by the internal review (designer mistake) or by the CRM (revision requested).
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {[['week', 'Week'], ['month', 'Month'], ['all', 'All time']].map(([k, l]) => (
              <button key={k} onClick={() => choose(k)}
                className={`px-3 py-1.5 text-[12px] font-semibold ${period === k ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
          {period !== 'all' && <button className="btn-secondary btn-sm" onClick={() => { setOffset(offset + 1); setPick(null); }}>← Prev</button>}
          <div className="text-[12.5px] font-semibold text-slate-700 whitespace-nowrap">{label}</div>
          {period !== 'all' && <button className="btn-secondary btn-sm" disabled={offset === 0} onClick={() => { setOffset(offset - 1); setPick(null); }}>Next →</button>}
          <input className="input !py-1.5 !text-[12px] w-52" placeholder="Client, order, designer…" value={q} onChange={(e) => { setQ(e.target.value); setPick(null); }} />
        </div>
      </div>

      {err && <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12.5px] px-3 py-2">{err}</div>}

      {!rows && !err ? (
        <div className="card p-10 text-center text-slate-400 text-[13px]">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total revisions" value={inRange.length} />
            <Stat label="Designer mistakes" sub="internal review rejected" value={designerCount} tone="amber" />
            <Stat label="CRM requested" sub="client asked for a change" value={crmCount} tone="sky" />
            <Stat label="Orders revised" value={byOrder.filter((t) => t.key !== '—').length} />
          </div>

          {inRange.length === 0 ? (
            <div className="card p-10 text-center text-slate-500 text-[12.5px]">No revisions {q ? 'match that search' : `in ${period === 'all' ? 'the log yet' : 'this period'}`}.</div>
          ) : (
            <>
              <div className="grid lg:grid-cols-2 gap-3">
                <div className="card p-0 overflow-x-auto">
                  <div className="px-4 py-2.5 border-b border-slate-100 text-[12.5px] font-semibold text-slate-700">By designer <span className="font-normal text-slate-400">· click to see their revisions</span></div>
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr>
                        <th className="table-th">Designer</th>
                        <th className="table-th text-right">Orders</th>
                        <th className="table-th text-right">Designer mistake</th>
                        <th className="table-th text-right">CRM requested</th>
                        <th className="table-th text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byDesigner.map((t) => (
                        <tr key={t.key} onClick={() => togglePick('designer', t.key)}
                          className={`cursor-pointer ${pick?.kind === 'designer' && pick.key === t.key ? 'bg-primary-50' : 'hover:bg-slate-50'}`}>
                          <td className="table-td font-medium">{t.key}</td>
                          <td className="table-td text-right">{t.orders.size}</td>
                          <td className="table-td text-right text-amber-700">{t.Designer}</td>
                          <td className="table-td text-right text-sky-700">{t.CRM}</td>
                          <td className="table-td text-right font-semibold">{t.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="card p-0 overflow-x-auto">
                  <div className="px-4 py-2.5 border-b border-slate-100 text-[12.5px] font-semibold text-slate-700">By order <span className="font-normal text-slate-400">· times revised</span></div>
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr>
                        <th className="table-th">Order</th>
                        <th className="table-th">Client</th>
                        <th className="table-th">Designer</th>
                        <th className="table-th">Stage</th>
                        <th className="table-th text-right">Designer mistake</th>
                        <th className="table-th text-right">CRM requested</th>
                        <th className="table-th text-right">Total</th>
                        <th className="table-th">Last</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byOrder.map((t) => (
                        <tr key={t.key} onClick={() => togglePick('order', t.key)}
                          className={`cursor-pointer ${pick?.kind === 'order' && pick.key === t.key ? 'bg-primary-50' : 'hover:bg-slate-50'}`}>
                          <td className="table-td font-medium whitespace-nowrap">{t.key}</td>
                          <td className="table-td">{t.client || '—'}</td>
                          <td className="table-td">{[...t.designers].join(', ') || '—'}</td>
                          <td className="table-td whitespace-nowrap">{[...t.stages].join(', ') || '—'}</td>
                          <td className="table-td text-right text-amber-700">{t.Designer}</td>
                          <td className="table-td text-right text-sky-700">{t.CRM}</td>
                          <td className="table-td text-right font-semibold">{t.total}</td>
                          <td className="table-td whitespace-nowrap text-slate-500">{fmtWhen(t.last)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card p-0 overflow-x-auto">
                <div className="px-4 py-2.5 border-b border-slate-100 text-[12.5px] font-semibold text-slate-700 flex items-center gap-2">
                  {pick ? <>Revisions — {pick.kind === 'designer' ? 'designer' : 'order'} {pick.key}
                    <button className="btn-ghost btn-sm !py-0.5" onClick={() => setPick(null)}>Show all</button></> : 'All revisions'}
                  <span className="font-normal text-slate-400">({listed.length})</span>
                </div>
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr>
                      <th className="table-th">When</th>
                      <th className="table-th">Order</th>
                      <th className="table-th">Client</th>
                      <th className="table-th">Stage</th>
                      <th className="table-th">Cause</th>
                      <th className="table-th">Designer</th>
                      <th className="table-th">Revision / remarks</th>
                      <th className="table-th">Sent back by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listed.map((r) => (
                      <tr key={r.id} className="align-top">
                        <td className="table-td whitespace-nowrap text-slate-600">{fmtWhen(r.created_at)}</td>
                        <td className="table-td font-medium">{r.order_no || '—'}</td>
                        <td className="table-td">{r.client || '—'}</td>
                        <td className="table-td">{r.stage || '—'}</td>
                        <td className="table-td"><SourceBadge source={r.source} /></td>
                        <td className="table-td">{r.designer || '—'}</td>
                        <td className="table-td text-slate-600 max-w-[320px]">
                          {r.remarks || '—'}
                          {String(r.photo || '').split(/\s+/).filter(Boolean).map((u, i) => (
                            <a key={i} href={u} target="_blank" rel="noreferrer" className="ml-1.5 text-primary-600 hover:underline whitespace-nowrap">Photo{i ? ` ${i + 1}` : ''}</a>
                          ))}
                        </td>
                        <td className="table-td text-slate-600">{r.raised_by || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, sub, value, tone }) {
  const color = tone === 'amber' ? 'text-amber-600' : tone === 'sky' ? 'text-sky-600' : 'text-slate-800';
  return (
    <div className="card p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-slate-400">{sub}</div>}
    </div>
  );
}

function SourceBadge({ source }) {
  return source === 'CRM'
    ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-100 whitespace-nowrap">CRM requested</span>
    : <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 whitespace-nowrap">Designer mistake</span>;
}

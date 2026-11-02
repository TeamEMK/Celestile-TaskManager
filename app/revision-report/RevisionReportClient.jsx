'use client';
import { useEffect, useMemo, useState } from 'react';

// Weekly design revision report (02-11-2026 meeting): how many times each
// client's work went back, and whether the designer's mistake (the internal
// review rejected it) or the CRM (client asked for a change) caused it.
// Rows come from lib/revisions.js, logged on every send-back.

const IST_MS = 330 * 60 * 1000;
const DAY_MS = 86400000;

// Monday 00:00 IST of the week holding `ms`, as a UTC epoch.
function weekStart(ms) {
  const ist = new Date(ms + IST_MS);
  const dow = (ist.getUTCDay() + 6) % 7; // Mon = 0
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow) - IST_MS;
}
const fmtDay = (ms) => new Date(ms + IST_MS).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtWhen = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t + IST_MS).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
};

function tally(rows, keyOf) {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyOf(r) || '—';
    const t = map.get(k) || { key: k, Designer: 0, CRM: 0, total: 0, orders: new Set() };
    t[r.source === 'CRM' ? 'CRM' : 'Designer']++;
    t.total++;
    if (r.order_no) t.orders.add(r.order_no);
    map.set(k, t);
  });
  return [...map.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

export default function RevisionReportClient() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [start, setStart] = useState(() => weekStart(Date.now()));
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/revisions').then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setRows(d) : setErr(d.error || 'Failed to load revisions')))
      .catch((e) => setErr(e.message));
  }, []);

  const end = start + 7 * DAY_MS;
  const week = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((r) => {
      const at = Date.parse(r.created_at);
      if (!(at >= start && at < end)) return false;
      return !t || [r.order_no, r.client, r.designer, r.stage, r.remarks, r.raised_by].some((v) => String(v || '').toLowerCase().includes(t));
    });
  }, [rows, start, end, q]);

  const byClient = useMemo(() => tally(week, (r) => r.client || (r.order_no ? `Order ${r.order_no}` : '')), [week]);
  const byDesigner = useMemo(() => tally(week, (r) => r.designer), [week]);
  const designerCount = week.filter((r) => r.source !== 'CRM').length;
  const crmCount = week.length - designerCount;
  const orderCount = new Set(week.map((r) => r.order_no).filter(Boolean)).size;
  const thisWeek = start === weekStart(Date.now());

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
          <button className="btn-secondary btn-sm" onClick={() => setStart(start - 7 * DAY_MS)}>← Prev</button>
          <div className="text-[12.5px] font-semibold text-slate-700 whitespace-nowrap">
            {fmtDay(start)} – {fmtDay(end - DAY_MS)}
          </div>
          <button className="btn-secondary btn-sm" disabled={thisWeek} onClick={() => setStart(start + 7 * DAY_MS)}>Next →</button>
          {!thisWeek && <button className="btn-ghost btn-sm" onClick={() => setStart(weekStart(Date.now()))}>This week</button>}
          <input className="input !py-1.5 !text-[12px] w-52" placeholder="Client, order, designer…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {err && <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12.5px] px-3 py-2">{err}</div>}

      {!rows && !err ? (
        <div className="card p-10 text-center text-slate-400 text-[13px]">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total revisions" value={week.length} />
            <Stat label="Designer mistakes" sub="internal review rejected" value={designerCount} tone="amber" />
            <Stat label="CRM requested" sub="client asked for a change" value={crmCount} tone="sky" />
            <Stat label="Orders affected" value={orderCount} />
          </div>

          {week.length === 0 ? (
            <div className="card p-10 text-center text-slate-500 text-[12.5px]">No revisions {q ? 'match that search' : 'this week'}.</div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-3">
                <TallyTable title="By client" keyLabel="Client" rows={byClient} />
                <TallyTable title="By designer" keyLabel="Designer" rows={byDesigner} />
              </div>

              <div className="card p-0 overflow-x-auto">
                <div className="px-4 py-2.5 border-b border-slate-100 text-[12.5px] font-semibold text-slate-700">All revisions this week</div>
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
                    {week.map((r) => (
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

function TallyTable({ title, keyLabel, rows }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <div className="px-4 py-2.5 border-b border-slate-100 text-[12.5px] font-semibold text-slate-700">{title}</div>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr>
            <th className="table-th">{keyLabel}</th>
            <th className="table-th text-right">Orders</th>
            <th className="table-th text-right">Designer mistake</th>
            <th className="table-th text-right">CRM requested</th>
            <th className="table-th text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.key}>
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
  );
}

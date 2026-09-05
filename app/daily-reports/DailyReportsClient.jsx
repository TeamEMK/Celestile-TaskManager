'use client';
import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import DateField from '../components/DateField';
import { downloadCsv } from '@/lib/csv';
import { fmtDMY } from '@/lib/dates';

const monthRange = (ym) => {
  // ym = 'YYYY-MM'
  const [y, m] = ym.split('-').map(Number);
  const from = new Date(y, m - 1, 1).toISOString().split('T')[0];
  const to = new Date(y, m, 0).toISOString().split('T')[0];
  return { from, to };
};
const curMonth = () => new Date().toISOString().slice(0, 7);
const fmt = fmtDMY;

// Client WhatsApp update — generated here, sent manually (opens WhatsApp
// with the message pre-filled via wa.me; nothing is auto-sent from the server).
function formatClientPhone(raw) {
  let n = String(raw || '').replace(/\D/g, '');
  n = n.replace(/^0+/, '');
  if (!n) return null;
  if (n.length === 10) n = '91' + n; // bare local number → assume India
  return n.length >= 11 && n.length <= 15 ? n : null;
}
function clientUpdateMessage(e) {
  return [
    `Hi ${e.client || 'there'},`,
    '',
    "Update on today's work:",
    `• Order No: ${e.orderNumber || '-'}`,
    `• Area: ${e.areaName || '-'}`,
    `• Task: ${e.taskType || e.department || '-'}`,
    `• Time spent: ${Number(e.minutes) || 0} min`,
    `• Software used: ${e.software || '-'}`,
    '',
    '— Celestile-TaskManager',
  ].join('\n');
}

function IconCalendar(props) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function IconUsers(props)    { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconList(props)    { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>; }
function IconSearch(props)  { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>; }
function IconDownload(props){ return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>; }
function IconPrinter(props) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>; }
function IconMegaphone(props){ return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>; }
function IconChartBar(props){ return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>; }
function IconReset(props)   { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/></svg>; }
function IconSend(props)    { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/></svg>; }

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
      (!t || (e.doer + e.client + (e.description || '') + (e.department || '') +
        (e.taskType || '') + (e.software || '') + (e.areaName || '') + (e.orderNumber || ''))
        .toLowerCase().includes(t))
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
    downloadCsv(`daily-report-${win.from}_to_${win.to}.csv`,
      ['Date', 'Doer', 'Client', 'Order Number', 'Area Name', 'Task Type', 'Software', 'Revision', 'Minutes'],
      filtered.map((e) => [
        fmt(e.entryDate), e.doer, e.client, e.orderNumber, e.areaName,
        e.taskType || e.department, e.software, e.revision || 'No', e.minutes,
      ]));
  }

  // PDF via browser print (user picks "Save as PDF")
  const downloadPDF = () => window.print();

  function resetFilters() { setMonth(curMonth()); setFrom(''); setTo(''); setQ(''); setDoer('All'); setClient('All'); }

  // Opens WhatsApp with the client update pre-filled — you review and hit
  // send yourself, nothing goes out automatically. Falls back to copying the
  // text if this entry has no client number to open a chat with.
  function sendToClient(e) {
    const msg = clientUpdateMessage(e);
    const phone = formatClientPhone(e.clientNumber);
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      navigator.clipboard?.writeText(msg).catch(() => {});
      setNote(`No client number on this entry (${e.client || 'row'}) — message copied to clipboard instead, paste it into WhatsApp manually.`);
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="page-title">Daily Reports</h1>
        <p className="page-sub">Task entries, time logged and per-employee summaries</p>
      </div>

      {/* date controls + automation banners */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="label !mb-0">Month</label>
          <input type="month" className="input w-auto" value={month}
            onChange={(e) => { setMonth(e.target.value); setFrom(''); setTo(''); }} />
          <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide">or</span>
          <label className="label !mb-0">From</label>
          <DateField className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label className="label !mb-0">To</label>
          <DateField className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn-ghost" onClick={resetFilters}><IconReset className="w-3.5 h-3.5" /> Reset</button>
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary" onClick={downloadCSV}><IconDownload className="w-3.5 h-3.5" /> CSV</button>
            <button className="btn-warn" onClick={downloadPDF}><IconPrinter className="w-3.5 h-3.5" /> PDF</button>
          </div>
        </div>

        {/* automation banners (manual + honest stub) */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 grid place-items-center shrink-0"><IconMegaphone className="w-4 h-4" /></div>
            <div>
              <div className="text-[13px] font-semibold text-amber-700">Daily Reminder</div>
              <div className="text-[11.5px] text-amber-700/80">
                Sends WhatsApp to the group with names of users who haven&apos;t filled today&apos;s report.
              </div>
            </div>
          </div>
          <button className="btn-warn shrink-0"
            onClick={() => setNote('WhatsApp sending is not configured. Connect a provider (Twilio / WhatsApp Business API) and a scheduler to enable auto-send.')}>
            <IconSend className="w-3.5 h-3.5" /> Send Now
          </button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 grid place-items-center shrink-0"><IconChartBar className="w-4 h-4" /></div>
            <div>
              <div className="text-[13px] font-semibold text-slate-700">Pending Task Summary</div>
              <div className="text-[11.5px] text-slate-500">
                Delegation / Checklist summary to the configured number + DMs to flagged recipients.
              </div>
            </div>
          </div>
          <button className="btn-secondary shrink-0"
            onClick={() => setNote('WhatsApp sending is not configured. Connect a provider and a scheduler to enable auto-send.')}>
            <IconSend className="w-3.5 h-3.5" /> Send Now
          </button>
        </div>
        {note && <p className="text-[12px] text-red-500">{note}</p>}
      </div>

      {/* per-user summary */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-slate-50/60">
          <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconUsers className="w-4 h-4" /></div>
          <div>
            <h2 className="text-[13.5px] font-semibold text-slate-900">Per-User Summary</h2>
            <p className="text-[11.5px] text-slate-500">Tasks &amp; minutes logged in the selected range</p>
          </div>
        </div>
        {perUser.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-3">
              <IconUsers className="w-6 h-6 text-slate-400" />
            </div>
            <div className="text-[12.5px] text-slate-500">No data in range.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                <tr>
                  <th className="table-th">Doer</th><th className="table-th">Tasks</th><th className="table-th">Total Minutes</th><th className="table-th">Hours</th>
                </tr>
              </thead>
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
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 flex-wrap bg-slate-50/60">
          <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconList className="w-4 h-4" /></div>
          <div className="mr-auto">
            <h2 className="text-[13.5px] font-semibold text-slate-900">All Entries</h2>
            <p className="text-[11.5px] text-slate-500">{filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'} in range</p>
          </div>
        </div>
        <div className="p-4 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <IconSearch className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input className="input pl-8" placeholder="Search by name / client / description…"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select w-auto" value={doer} onChange={(e) => setDoer(e.target.value)}>
            {doers.map((d) => <option key={d}>{d === 'All' ? 'All Doers' : d}</option>)}
          </select>
          <select className="select w-auto" value={client} onChange={(e) => setClient(e.target.value)}>
            {clients.map((c) => <option key={c}>{c === 'All' ? 'All Clients' : c}</option>)}
          </select>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-3">
              <IconList className="w-6 h-6 text-slate-400" />
            </div>
            <div className="text-[12.5px] text-slate-500">No entries.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                <tr>
                  <th className="table-th whitespace-nowrap">Date</th><th className="table-th">Doer</th><th className="table-th">Client</th>
                  <th className="table-th">Order #</th><th className="table-th">Area</th>
                  <th className="table-th">Task Type</th><th className="table-th">Software</th>
                  <th className="table-th">Rev</th><th className="table-th">Min</th><th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="table-row">
                    <td className="table-td whitespace-nowrap">{fmt(e.entryDate)}</td>
                    <td className="table-td">{e.doer}</td>
                    <td className="table-td">{e.client || '—'}</td>
                    <td className="table-td">{e.orderNumber || '—'}</td>
                    <td className="table-td max-w-[200px] truncate" title={e.areaName}>{e.areaName || '—'}</td>
                    <td className="table-td">{e.taskType || e.department || '—'}</td>
                    <td className="table-td">{e.software || '—'}</td>
                    <td className="table-td">{e.revision === 'Yes' ? <Icon name="check" className="w-4 h-4 text-emerald-600" title="Revised" /> : '—'}</td>
                    <td className="table-td">{e.minutes}</td>
                    <td className="table-td">
                      {e.client && <button className="btn-secondary btn-sm !px-2 !py-1" onClick={() => sendToClient(e)}><Icon name="send" className="w-3.5 h-3.5" /> Client Msg</button>}
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

'use client';
import { useEffect, useMemo, useState } from 'react';

const numOf = (s) => parseFloat(String(s || '').replace(/[^\d.]/g, '')) || 0;
const fmtINR = (n) => '₹ ' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const dateOf = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB').replaceAll('/', '-'); };
const ymd = (iso) => (iso ? String(iso).slice(0, 10) : '');
const curMonth = () => new Date().toISOString().slice(0, 7);

const STATUS_STYLE = {
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
  pending:  'bg-amber-50 text-amber-700',
};
function StatusPill({ status }) {
  const s = (status || 'pending').toLowerCase();
  const label = s === 'approved' ? '✓ Approved' : s === 'rejected' ? '✗ Rejected' : '⏳ Pending';
  return <span className={`pill whitespace-nowrap ${STATUS_STYLE[s] || STATUS_STYLE.pending}`}>{label}</span>;
}

export default function QuotationAdminClient() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    fetch('/api/quotations?full=1').then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.quotations) ? d.quotations : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const win = useMemo(() => {
    if (from && to) return { from, to };
    if (month) { const [y, m] = month.split('-').map(Number); return { from: `${month}-01`, to: new Date(y, m, 0).toISOString().slice(0, 10) }; }
    return null;
  }, [from, to, month]);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return rows.filter((r) => {
      if (branch !== 'all' && r.branch !== branch) return false;
      if (statusFilter !== 'all' && (r.status || 'pending') !== statusFilter) return false;
      if (win) { const d = ymd(r.createdAt); if (d && (d < win.from || d > win.to)) return false; }
      if (t && !((r.refNo + ' ' + r.clientName + ' ' + r.consultant + ' ' + (r.clientFirm || '')).toLowerCase().includes(t))) return false;
      return true;
    });
  }, [rows, branch, q, win]);

  const summary = useMemo(() => {
    let total = 0, bng = 0, hyd = 0, approved = 0, pending = 0, rejected = 0;
    filtered.forEach((r) => {
      total += numOf(r.grandTotal);
      if (r.branch === 'hyderabad') hyd++; else bng++;
      const s = (r.status || 'pending').toLowerCase();
      if (s === 'approved') approved++; else if (s === 'rejected') rejected++; else pending++;
    });
    return { count: filtered.length, total, bng, hyd, approved, pending, rejected };
  }, [filtered]);

  function downloadCSV() {
    const head = ['Ref', 'Branch', 'Client', 'Firm', 'Consultant', 'Grand Total', 'Date'];
    const cell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const lines = filtered.map((r) => [r.refNo, r.branch, cell(r.clientName), cell(r.clientFirm || ''), cell(r.consultant), numOf(r.grandTotal), dateOf(r.createdAt)].join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'quotations.csv'; a.click();
  }
  function reset() { setBranch('all'); setStatusFilter('all'); setQ(''); setMonth(''); setFrom(''); setTo(''); }

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[16px] font-semibold text-slate-900">Quotation Admin</div>
            <div className="text-[12px] text-slate-500">All saved quotations across both branches</div>
          </div>
          <button className="btn-secondary" onClick={downloadCSV}>⬇ CSV</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input w-auto" value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="all">All Branches</option><option value="bangalore">Bangalore</option><option value="hyderabad">Hyderabad</option>
          </select>
          <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
          <input className="input flex-1 min-w-[200px]" placeholder="🔍 Ref / client / consultant…" value={q} onChange={(e) => setQ(e.target.value)} />
          <input type="month" className="input w-auto" value={month} onChange={(e) => { setMonth(e.target.value); setFrom(''); setTo(''); }} />
          <span className="text-[11px] text-slate-400">or</span>
          <input type="date" className="input w-auto" value={from} onChange={(e) => { setFrom(e.target.value); setMonth(''); }} />
          <input type="date" className="input w-auto" value={to} onChange={(e) => { setTo(e.target.value); setMonth(''); }} />
          <button className="btn-ghost" onClick={reset}>↺ Reset</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Total" value={summary.count} />
          <Kpi label="Total Value" value={fmtINR(summary.total)} />
          <Kpi label="Bangalore" value={summary.bng} />
          <Kpi label="Hyderabad" value={summary.hyd} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="⏳ Pending" value={summary.pending} color="text-amber-700" />
          <Kpi label="✓ Approved" value={summary.approved} color="text-green-700" />
          <Kpi label="✗ Rejected" value={summary.rejected} color="text-red-700" />
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        {loading ? <div className="p-5 text-[12.5px] text-slate-400">Loading…</div> : filtered.length === 0 ? (
          <div className="p-5 text-[12.5px] text-slate-400">No quotations.</div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-900 text-white">
              <tr>{['Ref', 'Branch', 'Client', 'Consultant', 'Grand Total', 'Status', 'Date', ''].map((h, i) =>
                <th key={i} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.refNo + i} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{r.refNo}</td>
                  <td className="px-3 py-2">
                    <span className={`pill ${r.branch === 'hyderabad' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {r.branch === 'hyderabad' ? 'Hyderabad' : 'Bangalore'}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.clientName || '—'}{r.clientFirm ? <span className="text-slate-400"> · {r.clientFirm}</span> : ''}</td>
                  <td className="px-3 py-2">{r.consultant || '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{r.grandTotal || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><StatusPill status={r.status} /></td>
                  <td className="px-3 py-2 whitespace-nowrap">{dateOf(r.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <a className="btn-secondary !px-3 !py-1" href={`/quotation?branch=${r.branch}&ref=${encodeURIComponent(r.refNo)}`}>Open</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-[18px] font-bold mt-0.5 ${color || 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

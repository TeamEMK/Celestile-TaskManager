'use client';
import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { StatCard as UiStatCard, Modal } from '../components/ui';
import DateField from '../components/DateField';
import { downloadCsv } from '@/lib/csv';

const numOf = (s) => parseFloat(String(s || '').replace(/[^\d.]/g, '')) || 0;
const fmtINR = (n) => '₹ ' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const dateOf = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB').replaceAll('/', '-'); };
const ymd = (iso) => (iso ? String(iso).slice(0, 10) : '');

const STATUS_STYLE = {
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
  pending:  'bg-amber-50 text-amber-700',
};
function StatusPill({ status }) {
  const s = (status || 'pending').toLowerCase();
  const label = s === 'approved' ? 'Approved' : s === 'rejected' ? 'Rejected' : 'Pending';
  return <span className={`pill whitespace-nowrap ${STATUS_STYLE[s] || STATUS_STYLE.pending}`}>{label}</span>;
}

const BLANK_MODAL = { open: false, token: '', refNo: '', clientName: '', grandTotal: '', action: '', approverName: '', remarks: '', saving: false, err: '' };

export default function QuotationAdminClient() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branch, setBranch] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [modal, setModal] = useState(BLANK_MODAL);

  function loadRows() {
    setRefreshing(true);
    // ?list=1 returns only the columns this table renders — ?full=1 dragged
    // every quotation's item/PDF blobs down on each load and window focus.
    return fetch('/api/quotations?list=1').then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.quotations) ? d.quotations : []))
      .catch(() => setRows([]))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }

  useEffect(() => {
    loadRows();
    // New quotations are created from a different tab/device — refetch when the
    // admin returns to this tab so newly-saved rows show up without a hard reload.
    const onFocus = () => loadRows();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
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
  }, [rows, branch, q, win, statusFilter]);

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

  function openModal(r, action) {
    setModal({ ...BLANK_MODAL, open: true, token: r.approvalToken, refNo: r.refNo, clientName: r.clientName, grandTotal: r.grandTotal, action });
  }

  async function submitApproval() {
    if (!modal.approverName.trim()) { setModal(m => ({ ...m, err: 'Naam daalo' })); return; }
    setModal(m => ({ ...m, saving: true, err: '' }));
    try {
      const res = await fetch('/api/quotations/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: modal.token, action: modal.action, approverName: modal.approverName.trim(), reason: modal.remarks }),
      });
      const d = await res.json();
      if (!res.ok) { setModal(m => ({ ...m, saving: false, err: d.error || 'Error' })); return; }
      // update local row status
      setRows(rs => rs.map(r => r.refNo === modal.refNo ? { ...r, status: modal.action, approvedBy: modal.approverName } : r));
      setModal(BLANK_MODAL);
    } catch (e) {
      setModal(m => ({ ...m, saving: false, err: e.message }));
    }
  }

  function downloadCSV() {
    downloadCsv('quotations.csv',
      ['Ref', 'Branch', 'Client', 'Firm', 'Consultant', 'Grand Total', 'Status', 'Date'],
      filtered.map((r) => [r.refNo, r.branch, r.clientName, r.clientFirm || '', r.consultant, numOf(r.grandTotal), r.status || 'pending', dateOf(r.createdAt)]));
  }
  function reset() { setBranch('all'); setStatusFilter('all'); setQ(''); setMonth(''); setFrom(''); setTo(''); }

  const isApprove = modal.action === 'approved';

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Approval modal */}
      {modal.open && (
        <Modal onClose={() => setModal(BLANK_MODAL)} closable={!modal.saving} maxW="max-w-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${isApprove ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {isApprove ? <IconCheck className="w-5 h-5" /> : <IconX className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[15px] font-semibold text-slate-900">{isApprove ? 'Approve Quotation' : 'Reject Quotation'}</h2>
                <p className="text-[11.5px] text-slate-500 mt-0.5 truncate">
                  <span className="font-semibold text-slate-700">{modal.refNo}</span> · {modal.clientName || '—'} · {modal.grandTotal || '—'}
                </p>
              </div>
              <button onClick={() => !modal.saving && setModal(BLANK_MODAL)} disabled={modal.saving} className="btn-ghost w-8 h-8 !p-0 shrink-0">
                <IconClose className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {modal.err && <div className="text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">{modal.err}</div>}
              <div>
                <label className="label">Aapka Naam *</label>
                <input
                  className="input"
                  placeholder="Enter your name"
                  value={modal.approverName}
                  onChange={e => setModal(m => ({ ...m, approverName: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Remarks (optional)</label>
                <textarea
                  className="input resize-none"
                  rows="2"
                  placeholder="Add a comment..."
                  value={modal.remarks}
                  onChange={e => setModal(m => ({ ...m, remarks: e.target.value }))}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setModal(BLANK_MODAL)} disabled={modal.saving}>Cancel</button>
              <button
                onClick={submitApproval}
                disabled={modal.saving}
                className={isApprove ? 'btn-success' : 'btn-danger'}
              >
                {modal.saving ? 'Saving…' : isApprove ? 'Confirm Approve' : 'Confirm Reject'}
              </button>
            </div>
        </Modal>
      )}

      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
              <IconDocument className="w-[18px] h-[18px]" />
            </div>
            <div>
              <div className="font-display text-[16px] font-semibold text-slate-900">Quotation <span className="text-gradient-gold">Admin</span></div>
              <div className="page-sub !mt-0">All saved quotations across both branches</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" disabled={refreshing} onClick={loadRows}>
              <IconRefresh className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button className="btn-secondary" onClick={downloadCSV}><IconDownload className="w-3.5 h-3.5" /> CSV</button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select className="select w-auto" value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="all">All Branches</option><option value="bangalore">Bangalore</option><option value="hyderabad">Hyderabad</option>
          </select>
          <select className="select w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
          <input className="input flex-1 min-w-[200px]" placeholder="Ref / client / consultant…" value={q} onChange={(e) => setQ(e.target.value)} />
          <input type="month" className="input !w-auto" value={month} onChange={(e) => { setMonth(e.target.value); setFrom(''); setTo(''); }} />
          <span className="text-[11px] text-slate-400">or</span>
          <DateField className="input !w-auto" value={from} onChange={(e) => { setFrom(e.target.value); setMonth(''); }} />
          <DateField className="input !w-auto" value={to} onChange={(e) => { setTo(e.target.value); setMonth(''); }} />
          <button className="btn-ghost" onClick={reset}><Icon name="refresh" className="w-3.5 h-3.5" /> Reset</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total" value={summary.count} icon="file" grad="linear-gradient(135deg,#3b82f6,#4f46e5)" shadow="rgba(59,130,246,0.35)" />
          <StatCard label="Total Value" value={fmtINR(summary.total)} icon="rupee" grad="linear-gradient(135deg,#D9A81F,#8F6B10)" shadow="rgba(238,188,46,0.35)" />
          <StatCard label="Bangalore" value={summary.bng} icon="building" grad="linear-gradient(135deg,#10b981,#059669)" shadow="rgba(16,185,129,0.35)" />
          <StatCard label="Hyderabad" value={summary.hyd} icon="building" grad="linear-gradient(135deg,#7c3aed,#a855f7)" shadow="rgba(124,58,237,0.35)" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Pending" value={summary.pending} icon="clock" grad="linear-gradient(135deg,#f59e0b,#f97316)" shadow="rgba(245,158,11,0.35)" />
          <StatCard label="Approved" value={summary.approved} icon="check" grad="linear-gradient(135deg,#10b981,#059669)" shadow="rgba(16,185,129,0.35)" />
          <StatCard label="Rejected" value={summary.rejected} icon="x" grad="linear-gradient(135deg,#ef4444,#dc2626)" shadow="rgba(239,68,68,0.35)" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-slate-50/60">
          <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center"><IconList className="w-4 h-4" /></div>
          <div>
            <h2 className="text-[13.5px] font-semibold text-slate-900">Quotations</h2>
            <p className="text-[11.5px] text-slate-500">{filtered.length} record{filtered.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        {loading ? (
          <div className="p-14 text-center text-[12.5px] text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
              <IconDocument className="w-7 h-7 text-primary-400" />
            </div>
            <div className="text-[13.5px] font-semibold text-slate-700">No quotations found</div>
            <div className="text-[12px] text-slate-500 mt-0.5">Try adjusting your filters or search.</div>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                <tr>
                  {['Ref', 'Branch', 'Client', 'Consultant', 'Grand Total', 'Status', 'Date', ''].map((h, i) => (
                    <th key={i} className={`table-th ${h === 'Grand Total' ? 'text-right' : ''} ${h === '' ? 'text-right pr-4' : ''}`}>{h || 'Action'}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isPending = (r.status || 'pending') === 'pending';
                  return (
                    <tr key={r.refNo + i} className="table-row">
                      <td className="table-td font-semibold text-slate-800 whitespace-nowrap">{r.refNo}</td>
                      <td className="table-td">
                        <span className={`pill ${r.branch === 'hyderabad' ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {r.branch === 'hyderabad' ? 'Hyderabad' : 'Bangalore'}
                        </span>
                      </td>
                      <td className="table-td">{r.clientName || '—'}{r.clientFirm ? <span className="text-slate-400"> · {r.clientFirm}</span> : ''}</td>
                      <td className="table-td">{r.consultant || '—'}</td>
                      <td className="table-td text-right whitespace-nowrap font-semibold text-slate-800 tabular-nums">{r.grandTotal || '—'}</td>
                      <td className="table-td whitespace-nowrap">
                        <StatusPill status={r.status} />
                        {r.approvedBy && <div className="text-[10.5px] text-slate-400 mt-0.5">by {r.approvedBy}</div>}
                      </td>
                      <td className="table-td whitespace-nowrap text-slate-500">{dateOf(r.createdAt)}</td>
                      <td className="table-td">
                        <div className="flex items-center gap-1.5 justify-end pr-2">
                          {isPending && r.approvalToken && (
                            <>
                              <button
                                onClick={() => openModal(r, 'approved')}
                                className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
                              >Approve</button>
                              <button
                                onClick={() => openModal(r, 'rejected')}
                                className="pill bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer whitespace-nowrap"
                              >Reject</button>
                            </>
                          )}
                          <a className="btn-secondary btn-sm !px-2.5 !py-1 whitespace-nowrap" href={`/quotation?branch=${r.branch}&ref=${encodeURIComponent(r.refNo)}`}>Open</a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
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

function IconDocument(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6M9 9h1"/></svg>; }
function IconList(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>; }
function IconDownload(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>; }
function IconRefresh(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.4L3 16"/><path d="M8 16H3v5"/></svg>; }
function IconCheck(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>; }
function IconX(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>; }
function IconClose(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>; }

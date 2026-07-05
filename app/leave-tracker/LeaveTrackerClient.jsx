'use client';
import { useEffect, useMemo, useState } from 'react';

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB').replaceAll('/', '-') : '—');
const STATUS_STYLE = {
  pending:  'bg-amber-50 text-amber-600 border border-amber-100',
  approved: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  rejected: 'bg-red-50 text-red-600 border border-red-100',
};
const TYPE_STYLE = {
  Leave:          'bg-primary-50 text-primary-700',
  WFH:            'bg-violet-50 text-violet-700',
  'Extra Working': 'bg-blue-50 text-blue-700',
};

export default function LeaveTrackerClient({ userId, userName, canApprove }) {
  const [leaves, setLeaves] = useState([]);
  const [tab, setTab] = useState('All');
  const [scope, setScope] = useState(canApprove ? 'all' : 'mine'); // approvers can see all
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'Leave', fromDate: '', toDate: '', reason: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    const url = scope === 'mine' ? `/api/leaves?userId=${userId}` : '/api/leaves';
    try {
      const res = await fetch(url);
      const data = await res.json();
      setLeaves(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, [scope]);

  async function apply() {
    if (!form.fromDate || !form.toDate) return;
    setSaving(true);
    try {
      await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userName, ...form, approver: 'HOD' }),
      });
      setOpen(false);
      setForm({ type: 'Leave', fromDate: '', toDate: '', reason: '' });
      load();
    } finally { setSaving(false); }
  }

  async function decide(id, status) {
    await fetch('/api/leaves', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return leaves.filter((l) =>
      (tab === 'All' || l.status === tab.toLowerCase()) &&
      (!t || (l.userName + l.reason + l.type).toLowerCase().includes(t))
    );
  }, [leaves, tab, q]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-slate-50/80 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 grid place-items-center shrink-0"><IconLeave /></div>
            <div>
              <h2 className="text-[13.5px] font-semibold text-slate-900">Leave Tracker</h2>
              <p className="text-[11.5px] text-slate-500">Leave, WFH &amp; extra working &middot; Approver: <b className="text-amber-600">HOD</b></p>
            </div>
          </div>
          <button className="btn-warn" onClick={() => setOpen(true)}><IconPlus /> Apply for Leave</button>
        </div>

        <div className="px-5 pt-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="seg">
              {['All', 'Pending', 'Approved', 'Rejected'].map((t) => (
                <button key={t}
                  className={`seg-btn ${tab === t ? 'seg-btn-active' : ''}`}
                  onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>
            {canApprove && (
              <select className="input w-auto" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">All employees</option>
                <option value="mine">My leaves</option>
              </select>
            )}
          </div>
          <input className="input max-w-xs" placeholder="Search by name / reason / type…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="mt-4">
          {filtered.length === 0 ? (
            <div className="p-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 grid place-items-center mx-auto mb-3">
                <IconEmptyCal className="w-6 h-6 text-slate-300" />
              </div>
              <div className="text-[13.5px] font-semibold text-slate-700">No leave records yet</div>
              <div className="text-[12px] text-slate-500 mt-0.5">Requests you apply for will show up here.</div>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                  <tr>
                    <th className="table-th">Name</th>
                    <th className="table-th">Type</th>
                    <th className="table-th">From</th>
                    <th className="table-th">To</th>
                    <th className="table-th">Reason</th>
                    <th className="table-th">Status</th>
                    {canApprove && <th className="table-th text-right pr-3">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id} className="table-row">
                      <td className="table-td">
                        <div className="flex items-center gap-1.5">
                          <Avatar name={l.userName} />
                          <span className="font-medium text-slate-800">{l.userName}</span>
                        </div>
                      </td>
                      <td className="table-td"><span className={`pill ${TYPE_STYLE[l.type] || 'bg-slate-100 text-slate-700'}`}>{l.type}</span></td>
                      <td className="table-td whitespace-nowrap">{fmt(l.fromDate)}</td>
                      <td className="table-td whitespace-nowrap">{fmt(l.toDate)}</td>
                      <td className="table-td max-w-[260px] truncate" title={l.reason}>{l.reason || '—'}</td>
                      <td className="table-td">
                        <span className={`pill ${STATUS_STYLE[l.status] || ''}`}>{l.status}</span>
                      </td>
                      {canApprove && (
                        <td className="table-td">
                          {l.status === 'pending' ? (
                            <div className="flex gap-1.5 justify-end pr-2">
                              <button className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer" onClick={() => decide(l.id, 'approved')}>Approve</button>
                              <button className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer" onClick={() => decide(l.id, 'rejected')}>Reject</button>
                            </div>
                          ) : <span className="text-slate-400 text-[11px] block text-right">{fmt(l.decidedAt)}</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={() => !saving && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-amber-50 text-amber-600"><IconLeave /></div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900">Apply for Leave</h2>
                <p className="text-xs text-slate-500 mt-0.5">Sent to your approver for review</p>
              </div>
              <button onClick={() => setOpen(false)} disabled={saving} className="btn-ghost w-8 h-8 !p-0 shrink-0">
                <IconClose />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="label">Type</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option>Leave</option><option>WFH</option><option>Extra Working</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">From</label>
                  <input type="date" className="input" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} /></div>
                <div><label className="label">To</label>
                  <input type="date" className="input" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} /></div>
              </div>
              <div><label className="label">Reason</label>
                <textarea className="input resize-none" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button className="btn-secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-warn" disabled={saving} onClick={apply}>{saving ? 'Applying…' : 'Apply'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ name = '' }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '·';
  const palette = ['from-rose-400 to-pink-600', 'from-amber-400 to-orange-600', 'from-emerald-400 to-teal-600', 'from-primary-400 to-primary-600', 'from-violet-400 to-purple-600'];
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${palette[hash % palette.length]} text-white grid place-items-center text-[9px] font-bold shrink-0`}>{ini}</div>;
}

function IconPlus()   { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function IconClose()  { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>; }
function IconLeave()  { return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>; }
function IconEmptyCal({ className }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9.5 14.5 5 5m0-5-5 5"/></svg>; }

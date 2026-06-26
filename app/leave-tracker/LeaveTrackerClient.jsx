'use client';
import { useEffect, useMemo, useState } from 'react';

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB').replaceAll('/', '-') : '—');
const STATUS_STYLE = {
  pending:  'bg-amber-50 text-amber-600',
  approved: 'bg-emerald-50 text-emerald-600',
  rejected: 'bg-red-50 text-red-600',
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
    <div className="space-y-4">
<div className="card p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <p className="text-[13px] text-slate-600">
            Apply for leave, work-from-home, or extra working. <b className="text-amber-600">Your approver: HOD</b>
          </p>
          <button className="btn-warn" onClick={() => setOpen(true)}>+ Apply for Leave</button>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 mt-5">
          <div className="flex items-center gap-2 flex-wrap">
            {['All', 'Pending', 'Approved', 'Rejected'].map((t) => (
              <button key={t}
                className={`pill border ${tab === t ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-600 border-slate-200'}`}
                onClick={() => setTab(t)}>{t}</button>
            ))}
            {canApprove && (
              <select className="input w-auto ml-2" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">All employees</option>
                <option value="mine">My leaves</option>
              </select>
            )}
          </div>
          <input className="input max-w-xs" placeholder="🔍 Search by name / reason / type…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="mt-4">
          {filtered.length === 0 ? (
            <p className="text-center text-[13px] text-slate-400 py-8">No leave records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">From</th>
                  <th className="table-th">To</th>
                  <th className="table-th">Reason</th>
                  <th className="table-th">Status</th>
                  {canApprove && <th className="table-th text-right pr-3">Action</th>}
                </tr></thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id} className="table-row">
                      <td className="table-td font-medium text-slate-800">{l.userName}</td>
                      <td className="table-td">{l.type}</td>
                      <td className="table-td">{fmt(l.fromDate)}</td>
                      <td className="table-td">{fmt(l.toDate)}</td>
                      <td className="table-td max-w-[260px] truncate" title={l.reason}>{l.reason || '—'}</td>
                      <td className="table-td">
                        <span className={`pill ${STATUS_STYLE[l.status] || ''}`}>{l.status}</span>
                      </td>
                      {canApprove && (
                        <td className="table-td">
                          {l.status === 'pending' ? (
                            <div className="flex gap-1 justify-end">
                              <button className="btn-success" onClick={() => decide(l.id, 'approved')}>Approve</button>
                              <button className="btn-danger" onClick={() => decide(l.id, 'rejected')}>Reject</button>
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
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center overflow-y-auto z-50 pt-10 px-4 pb-4" onClick={() => setOpen(false)}>
          <div className="card p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold mb-4">Apply for Leave</div>
            <div className="space-y-3">
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
                <textarea className="input" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-warn" disabled={saving} onClick={apply}>{saving ? 'Applying…' : 'Apply'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

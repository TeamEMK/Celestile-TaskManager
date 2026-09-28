'use client';
import { useEffect, useMemo, useState } from 'react';
import DateField from '../components/DateField';
import Avatar from '../components/Avatar';
import { fmtDMY } from '@/lib/dates';
import { mergeDepartments } from '@/lib/departments';

const fmt = fmtDMY;
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

function normRoles(roles) {
  if (Array.isArray(roles)) return roles;
  if (typeof roles === 'string') return roles.split(',').map((r) => r.trim()).filter(Boolean);
  return [];
}

export default function LeaveTrackerClient({ userId, userName, canApprove, isAdmin, isHod }) {
  const [leaves, setLeaves] = useState([]);
  const [balances, setBalances] = useState([]);
  const [settings, setSettings] = useState({ approvers: {}, quotas: {}, types: [] });
  const [tab, setTab] = useState('All');
  const [scope, setScope] = useState(canApprove ? 'all' : 'mine'); // approvers can see all
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [form, setForm] = useState({ type: 'Leave', fromDate: '', toDate: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [applyError, setApplyError] = useState('');

  async function load() {
    const url = scope === 'mine' ? `/api/leaves?userId=${userId}` : '/api/leaves';
    try {
      const res = await fetch(url);
      const data = await res.json();
      setLeaves(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }
  async function loadBalances() {
    try {
      const res = await fetch('/api/leaves/balance');
      const data = await res.json();
      setBalances(Array.isArray(data.balances) ? data.balances : []);
    } catch { /* ignore */ }
  }
  async function loadSettings() {
    try {
      const res = await fetch('/api/leaves/settings');
      const data = await res.json();
      setSettings({ approvers: data.approvers || {}, quotas: data.quotas || {}, types: data.types || [] });
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, [scope]);
  useEffect(() => { loadBalances(); loadSettings(); }, []);

  async function apply() {
    if (!form.fromDate || !form.toDate) return;
    setSaving(true);
    setApplyError('');
    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userName, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setApplyError(data.error || 'Failed to apply'); return; }
      setOpen(false);
      setForm({ type: 'Leave', fromDate: '', toDate: '', reason: '' });
      load();
      loadBalances();
    } finally { setSaving(false); }
  }

  async function decide(id, status) {
    await fetch('/api/leaves', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    load();
    loadBalances();
  }

  // Mirrors canDecideLeave() in lib/leaves.js — Admin decides anything; an
  // HOD only a leave routed to them (or any, if its department has no
  // configured approver). Server re-checks this regardless.
  function canDecideRow(l) {
    if (isAdmin) return true;
    if (isHod) return !l.approverId || String(l.approverId) === String(userId);
    return false;
  }
  const anyDecidableColumn = canApprove; // keeps the Action column width/placement as before

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return leaves.filter((l) =>
      (tab === 'All' || l.status === tab.toLowerCase()) &&
      (!t || (l.userName + l.reason + l.type).toLowerCase().includes(t))
    );
  }, [leaves, tab, q]);

  const trackedBalances = balances.filter((b) => b.quota > 0);
  const currentQuota = Number(settings.quotas?.[form.type] || 0);
  const currentBal = balances.find((b) => b.type === form.type);

  return (
    <div className="space-y-4 animate-fade-in">
      {trackedBalances.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {trackedBalances.map((b) => (
            <div key={b.type} className="pill bg-white border border-slate-200 text-slate-600">
              <span className="font-medium text-slate-800">{b.type}</span>: {b.used}/{b.quota} used this year
              {b.remaining === 0 && <span className="text-red-500 font-medium"> · none left</span>}
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 grid place-items-center shrink-0"><IconLeave /></div>
            <div>
              <h2 className="text-[13.5px] font-semibold text-slate-900">Leave Tracker</h2>
              <p className="text-[11.5px] text-slate-500">Leave, WFH &amp; extra working &middot; routed to your department's approver</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button className="btn-secondary" onClick={() => setSettingsOpen(true)}><IconGear /> Settings</button>
            )}
            <button className="btn-warn" onClick={() => setOpen(true)}><IconPlus /> Apply for Leave</button>
          </div>
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
              <select className="select w-auto" value={scope} onChange={(e) => setScope(e.target.value)}>
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
            <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                  <tr>
                    <th className="table-th">Name</th>
                    <th className="table-th">Type</th>
                    <th className="table-th">From</th>
                    <th className="table-th">To</th>
                    <th className="table-th">Reason</th>
                    <th className="table-th">Approver</th>
                    <th className="table-th">Status</th>
                    {anyDecidableColumn && <th className="table-th text-right pr-3">Action</th>}
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
                      <td className="table-td text-slate-500">{l.approver || 'HOD'}</td>
                      <td className="table-td">
                        <span className={`pill ${STATUS_STYLE[l.status] || ''}`}>{l.status}</span>
                      </td>
                      {anyDecidableColumn && (
                        <td className="table-td">
                          {l.status === 'pending' && canDecideRow(l) ? (
                            <div className="flex gap-1.5 justify-end pr-2">
                              <button className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer" onClick={() => decide(l.id, 'approved')}>Approve</button>
                              <button className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer" onClick={() => decide(l.id, 'rejected')}>Reject</button>
                            </div>
                          ) : l.status !== 'pending' ? (
                            <span className="text-slate-400 text-[11px] block text-right">{fmt(l.decidedAt)}</span>
                          ) : (
                            <span className="text-slate-300 text-[11px] block text-right">—</span>
                          )}
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
        <div className="fixed inset-0 bg-slate-900/25 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={() => !saving && setOpen(false)}>
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
                {currentQuota > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {currentBal ? `${currentBal.remaining} of ${currentBal.quota} day(s) left this year` : `${currentQuota} day(s)/year`}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">From</label>
                  <DateField className="input" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} /></div>
                <div><label className="label">To</label>
                  <DateField className="input" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} /></div>
              </div>
              <div><label className="label">Reason</label>
                <textarea className="input resize-none" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
              {applyError && <p className="text-[12px] text-red-600">{applyError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button className="btn-secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-warn" disabled={saving} onClick={apply}>{saving ? 'Applying…' : 'Apply'}</button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && isAdmin && (
        <LeaveSettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => { setSettings(next); setSettingsOpen(false); loadBalances(); }}
        />
      )}
    </div>
  );
}

function LeaveSettingsModal({ settings, onClose, onSaved }) {
  const [quotas, setQuotas] = useState({ ...settings.quotas });
  const [approvers, setApprovers] = useState({ ...settings.approvers });
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [uRes, dRes] = await Promise.all([fetch('/api/users'), fetch('/api/departments')]);
        const uData = await uRes.json().catch(() => []);
        const dData = await dRes.json().catch(() => []);
        setUsers(Array.isArray(uData) ? uData : []);
        setDepartments(mergeDepartments(Array.isArray(dData) ? dData : []));
      } catch { /* ignore */ }
    })();
  }, []);

  const approverOptions = useMemo(
    () => users.filter((u) => {
      const r = normRoles(u.roles);
      return r.includes('Admin') || r.includes('HOD');
    }),
    [users]
  );

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/leaves/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotas, approvers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Failed to save'); return; }
      onSaved({ approvers: data.approvers, quotas: data.quotas, types: data.types });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/25 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-amber-50 text-amber-600"><IconGear /></div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">Leave Tracker Settings</h2>
            <p className="text-xs text-slate-500 mt-0.5">Annual quotas and department-wise approvers</p>
          </div>
          <button onClick={onClose} disabled={saving} className="btn-ghost w-8 h-8 !p-0 shrink-0"><IconClose /></button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <h3 className="text-[12.5px] font-semibold text-slate-700 mb-2">Annual quotas (working days)</h3>
            <div className="grid grid-cols-3 gap-3">
              {(settings.types.length ? settings.types : ['Leave', 'WFH', 'Extra Working']).map((t) => (
                <div key={t}>
                  <label className="label">{t}</label>
                  <input type="number" min="0" className="input" value={quotas[t] ?? 0}
                    onChange={(e) => setQuotas({ ...quotas, [t]: Math.max(0, Number(e.target.value) || 0) })} />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">0 means unlimited — applying is never blocked for that type.</p>
          </div>

          <div>
            <h3 className="text-[12.5px] font-semibold text-slate-700 mb-2">Approver by department</h3>
            <p className="text-[11px] text-slate-500 mb-2">Leave a department unassigned to keep the old "any HOD/Admin may decide" rule.</p>
            <div className="space-y-2">
              {departments.map((d) => (
                <div key={d.value} className="flex items-center gap-2">
                  <span className="text-[12.5px] text-slate-700 w-44 shrink-0 truncate" title={d.label}>{d.label}</span>
                  <select className="select flex-1" value={approvers[d.value] || ''}
                    onChange={(e) => setApprovers({ ...approvers, [d.value]: e.target.value || undefined })}>
                    <option value="">— any HOD/Admin —</option>
                    {approverOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button className="btn-secondary" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn-warn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function IconPlus()   { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function IconClose()  { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>; }
function IconLeave()  { return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>; }
function IconEmptyCal({ className }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9.5 14.5 5 5m0-5-5 5"/></svg>; }
function IconGear()   { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }

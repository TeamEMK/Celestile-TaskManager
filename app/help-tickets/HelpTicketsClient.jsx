'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '../components/Icon';
import { EmptyState, ErrorState, LoadingState, ResultCount } from '../components/ui';
import { mergeDepartments } from '@/lib/departments';
import {
  STATUSES, STATUS_LABELS, PRIORITIES, DONE_STATUSES,
  STATUS_PILL, PRIORITY_PILL, fmtDate, age,
} from './ticketUi';
import DateField from '../components/DateField';

const BLANK_FILTERS = { status: '', priority: '', assignee: '', from: '', to: '', q: '' };
const blankForm = () => ({ subject: '', category: '', priority: 'Medium', description: '' });

export default function HelpTicketsClient({ userId, isAdmin }) {
  const router = useRouter();
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);      // null until the first load lands
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');      // a list that fails to load says so
  const [users, setUsers] = useState([]);
  const [customDepartments, setCustomDepartments] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Accepts an explicit page so a caller that also just changed `page` state
  // (React batches that, so it isn't visible yet) can still ask for the right
  // page instead of the stale one closed over from the render it was called in.
  const load = useCallback(async (pageOverride) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(pageOverride ?? page) });
      Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v); });
      const res = await fetch(`/api/help-tickets?${qs.toString()}`);
      const body = await res.json().catch(() => ({}));
      // Never fall through to the empty state on a failure — "No tickets yet"
      // reads as "everything is fine" when the API is actually down.
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      setData(body);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load tickets');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/users');
        const list = await res.json();
        setUsers(Array.isArray(list) ? list.filter((u) => u.active === undefined || Number(u.active) === 1) : []);
      } catch { /* the assignee filter just stays empty */ }
      try {
        const res = await fetch('/api/departments');
        const list = await res.json();
        setCustomDepartments(Array.isArray(list) ? list : []);
      } catch { /* falls back to the built-in department list */ }
    })();
  }, []);

  const departments = useMemo(() => mergeDepartments(customDepartments), [customDepartments]);
  const setFilter = (k, v) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };
  const anyFilter = Object.values(filters).some(Boolean);

  async function raise() {
    const subject = form.subject.trim();
    if (!subject) { setFormError('A one-line subject is required'); return; }
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/help-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not raise the ticket');
      setOpen(false);
      setForm(blankForm());
      setPage(1);
      load(1);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const rows = data?.rows || [];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <Icon name="clipboard" className="w-[18px] h-[18px]" />
          </div>
          <div>
            <div className="font-display text-[16px] font-semibold tracking-tight text-slate-900">Help Tickets</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {isAdmin ? 'Every ticket raised across the company' : 'Tickets you raised or are working on'}
            </div>
          </div>
        </div>
        <button className="btn-primary" onClick={() => { setFormError(''); setOpen(true); }}>
          <Icon name="plus" className="w-3.5 h-3.5" /> New Ticket
        </button>
      </div>

      <div className="toolbar">
        <select className="select w-auto" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select className="select w-auto" value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="select w-auto" value={filters.assignee} onChange={(e) => setFilter('assignee', e.target.value)}>
          <option value="">Anyone</option>
          <option value={userId}>Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {users.filter((u) => String(u.id) !== String(userId))
            .map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <label className="text-[11.5px] text-slate-500 flex items-center gap-1.5">
          Raised
          <DateField className="ctl px-2" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
          <span className="text-slate-300">→</span>
          <DateField className="ctl px-2" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
        </label>
        <input
          className="input-ctl max-w-[220px]"
          placeholder="Search subject / description…"
          value={filters.q}
          onChange={(e) => setFilter('q', e.target.value)}
        />
        {anyFilter && (
          <button className="text-[11.5px] text-slate-500 hover:text-red-600 font-medium"
            onClick={() => { setPage(1); setFilters(BLANK_FILTERS); }}>
            Clear all
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {data && <ResultCount shown={rows.length} total={data.total} noun="ticket" />}
          <button className="btn-ghost btn-sm" onClick={load} title="Reload">
            <Icon name="refresh" className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {error ? (
          <ErrorState title="Could not load tickets" hint={error} />
        ) : loading && !data ? (
          <LoadingState label="Loading tickets…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title={anyFilter ? 'No tickets match these filters' : 'No tickets yet'}
            hint={anyFilter
              ? 'Clear a filter to widen the search.'
              : 'Raise one and it lands in the admin queue straight away.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/95">
                <tr>
                  <th className="table-th">Ticket no</th>
                  <th className="table-th">Subject</th>
                  <th className="table-th">Category</th>
                  <th className="table-th">Raised by</th>
                  <th className="table-th">Assigned to</th>
                  <th className="table-th">Priority</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Age</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  // Resolved and closed rows recede rather than disappearing —
                  // they are still the answer to "what happened to my ticket?".
                  const done = DONE_STATUSES.includes(t.status);
                  return (
                    <tr
                      key={t.id}
                      className={`table-row cursor-pointer ${done ? 'opacity-60' : ''}`}
                      onClick={() => router.push(`/help-tickets/${t.id}`)}
                    >
                      <td className="table-td font-mono text-[11.5px] text-slate-500 whitespace-nowrap">{t.id}</td>
                      <td className="table-td max-w-[320px] truncate font-medium text-slate-800" title={t.subject}>{t.subject}</td>
                      <td className="table-td whitespace-nowrap">{t.category || '—'}</td>
                      <td className="table-td whitespace-nowrap">{t.raisedBy}</td>
                      <td className="table-td whitespace-nowrap">
                        {t.assignedTo || <span className="text-slate-400">Unassigned</span>}
                      </td>
                      <td className="table-td"><span className={`pill ${PRIORITY_PILL[t.priority] || ''}`}>{t.priority}</span></td>
                      <td className="table-td"><span className={`pill ${STATUS_PILL[t.status] || ''}`}>{t.statusLabel}</span></td>
                      <td className="table-td tabular-nums whitespace-nowrap" title={`Raised ${fmtDate(t.createdAt)}`}>
                        {age(t.createdAt, t.resolvedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11.5px] text-slate-500 tabular-nums">
              Page <b className="text-slate-800">{data.page}</b> of {data.pages} · {data.total.toLocaleString()} tickets
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-secondary btn-sm" disabled={data.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <Icon name="chevronLeft" className="w-3.5 h-3.5" /> Previous
              </button>
              <button className="btn-secondary btn-sm" disabled={data.page >= data.pages || loading}
                onClick={() => setPage((p) => p + 1)}>
                Next <Icon name="chevronRight" className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4"
          onClick={() => !saving && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-primary-50 text-primary-600">
                <Icon name="clipboard" className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900">New Ticket</h2>
                {/* No name field and no date field: the server already knows
                    who you are and what time it is. */}
                <p className="text-xs text-slate-500 mt-0.5">Raised in your name, right now</p>
              </div>
              <button onClick={() => setOpen(false)} disabled={saving} className="btn-ghost w-8 h-8 !p-0 shrink-0">
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="label">Subject</label>
                <input className="input" autoFocus maxLength={255} placeholder="What is the issue?"
                  value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="">Not sure</option>
                    {departments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Priority</label>
                  <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input resize-none" rows={4} placeholder="Anything that helps whoever picks this up"
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              {formError && <div className="text-[12px] text-red-600">{formError}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button className="btn-secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={raise}>{saving ? 'Raising…' : 'Raise Ticket'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

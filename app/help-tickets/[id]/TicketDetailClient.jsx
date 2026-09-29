'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '../../components/Icon';
import { ErrorState, LoadingState } from '../../components/ui';
import {
  STATUSES, STATUS_LABELS, PRIORITIES, DONE_STATUSES,
  STATUS_PILL, PRIORITY_PILL, fmtDate, fmtDateTime, age,
} from '../ticketUi';
import DateField from '../../components/DateField';

const EVENT_ICON = { comment: 'send', status: 'refresh', assign: 'user' };

export default function TicketDetailClient({ ticketId }) {
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/help-tickets/${ticketId}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      setData(body);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load this ticket');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/users');
        const list = await res.json();
        setUsers(Array.isArray(list) ? list.filter((u) => u.active === undefined || Number(u.active) === 1) : []);
      } catch { /* the assignee dropdown just stays empty */ }
    })();
  }, []);

  // Every one of these is re-checked on the server against this ticket; the
  // controls are only hidden so nobody is offered a button that would 403.
  async function patch(fields) {
    setBusy(true);
    setActionError('');
    try {
      const res = await fetch(`/api/help-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'That change was not accepted');
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function postComment() {
    const text = comment.trim();
    if (!text) return;
    setBusy(true);
    setActionError('');
    try {
      const res = await fetch(`/api/help-tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not post that comment');
      setComment('');
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <div className="card"><LoadingState label="Loading ticket…" /></div>;
  if (error) {
    return (
      <div className="space-y-4 animate-fade-in">
        <BackLink />
        <div className="card">
          <ErrorState title="Could not open this ticket" hint={error} />
        </div>
      </div>
    );
  }

  const { ticket: t, events, can } = data;
  const done = DONE_STATUSES.includes(t.status);

  return (
    <div className="space-y-4 animate-fade-in">
      <BackLink />

      <div className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-mono text-[11.5px] text-slate-400">{t.id}</div>
            <h1 className="font-display text-[17px] font-semibold tracking-tight text-slate-900 mt-0.5">{t.subject}</h1>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`pill ${PRIORITY_PILL[t.priority] || ''}`}>{t.priority}</span>
            <span className={`pill ${STATUS_PILL[t.status] || ''}`}>{t.statusLabel}</span>
          </div>
        </div>

        {t.description && (
          <div className="text-[13px] text-slate-600 whitespace-pre-wrap border-l-2 border-slate-100 pl-3">{t.description}</div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
          <Fact label="Category" value={t.category || '—'} />
          <Fact label="Raised by" value={t.raisedBy} />
          <Fact label="Assigned to" value={t.assignedTo || 'Unassigned'} />
          <Fact label="Due" value={fmtDate(t.dueDate)} />
          <Fact label="Raised" value={fmtDateTime(t.createdAt)} />
          <Fact label={done ? 'Turnaround' : 'Age'} value={age(t.createdAt, t.resolvedAt)} />
        </div>
      </div>

      {(can.manage || (can.reopen && done)) && (
        <div className="card p-4">
          <div className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2.5">Actions</div>
          <div className="flex items-end gap-2 flex-wrap">
            {can.manage && (
              <>
                <Field label="Status">
                  <select className="select w-auto" value={t.status} disabled={busy}
                    onChange={(e) => patch({ status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </Field>
                <Field label="Assigned to">
                  <select className="select w-auto" value={t.assignedToId || ''} disabled={busy}
                    onChange={(e) => patch({ assignedToId: e.target.value })}>
                    <option value="">Unassigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <select className="select w-auto" value={t.priority} disabled={busy}
                    onChange={(e) => patch({ priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Due date">
                  <DateField className="ctl px-2" value={t.dueDate ? String(t.dueDate).slice(0, 10) : ''}
                    disabled={busy} onChange={(e) => patch({ dueDate: e.target.value })} />
                </Field>
              </>
            )}
            {/* The raiser's one right on a finished ticket: say it isn't fixed. */}
            {!can.manage && can.reopen && done && (
              <button className="btn-warn btn-sm" disabled={busy} onClick={() => patch({ status: 'open' })}>
                <Icon name="refresh" className="w-3.5 h-3.5" /> Reopen ticket
              </button>
            )}
          </div>
          {actionError && <div className="text-[12px] text-red-600 mt-2.5">{actionError}</div>}
        </div>
      )}

      <div className="card p-5">
        <div className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Thread <span className="text-slate-400 font-normal normal-case">· {events.length} entr{events.length === 1 ? 'y' : 'ies'}</span>
        </div>

        <ol className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex gap-2.5">
              <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 mt-0.5
                ${e.kind === 'comment' ? 'bg-slate-100 text-slate-500' : 'bg-primary-50 text-primary-600'}`}>
                <Icon name={EVENT_ICON[e.kind] || 'dot'} className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0">
                <div className="text-[12px] text-slate-500">
                  <b className="text-slate-800 font-semibold">{e.actor}</b>
                  <span className="text-slate-300 mx-1.5">·</span>
                  {fmtDateTime(e.createdAt)}
                </div>
                <div className={`text-[13px] whitespace-pre-wrap ${e.kind === 'comment' ? 'text-slate-700' : 'text-slate-500 italic'}`}>
                  {e.body}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {can.comment && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <textarea className="input resize-none" rows={3} placeholder="Add to the thread…"
              value={comment} disabled={busy} onChange={(ev) => setComment(ev.target.value)} />
            <div className="flex justify-end mt-2">
              <button className="btn-primary btn-sm" disabled={busy || !comment.trim()} onClick={postComment}>
                <Icon name="send" className="w-3.5 h-3.5" /> {busy ? 'Posting…' : 'Post comment'}
              </button>
            </div>
            {actionError && !busy && <div className="text-[12px] text-red-600 mt-1.5">{actionError}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/help-tickets" className="text-[12px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5">
      <Icon name="chevronLeft" className="w-3.5 h-3.5" /> All tickets
    </Link>
  );
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-[13px] text-slate-800 truncate" title={value}>{value}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      {children}
    </div>
  );
}

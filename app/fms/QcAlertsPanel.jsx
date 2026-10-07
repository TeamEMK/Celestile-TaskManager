'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';

// QC Alerts — the O2D rework record (every failed checklist answer that went
// out to a WhatsApp group, lib/qcAlerts.js) and the named groups those
// alerts go to. Admin only; the API refuses anyone else.
export default function QcAlertsPanel() {
  const [alerts, setAlerts] = useState(null);
  const [groups, setGroups] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState([]);
  const [showGroups, setShowGroups] = useState(false);

  useEffect(() => {
    fetch('/api/qc-alerts').then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setAlerts(d) : setErr(d.error || 'Failed to load alerts')))
      .catch((e) => setErr(e.message));
    fetch('/api/qc-alerts/groups').then((r) => r.json())
      .then((d) => { if (!d.error) setGroups(d); })
      .catch(() => {});
  }, []);

  // One line per order: how many times it bounced back, and at which checks.
  const orders = useMemo(() => {
    const map = new Map();
    (alerts || []).forEach((a) => {
      const key = a.order_no || '(no order no.)';
      const o = map.get(key) || { orderNo: key, alerts: [], last: '', steps: new Set() };
      o.alerts.push(a);
      if (a.created_at > o.last) o.last = a.created_at;
      if (a.step_name || a.source) o.steps.add(a.step_name || a.source);
      map.set(key, o);
    });
    const t = q.trim().toLowerCase();
    return [...map.values()]
      .filter((o) => !t || [o.orderNo, ...o.alerts.flatMap((a) => [a.check_label, a.step_name, a.source, a.raised_by, a.area])]
        .some((v) => String(v || '').toLowerCase().includes(t)))
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [alerts, q]);

  const unsetCount = groups ? Object.values(groups).filter((v) => !String(v || '').trim()).length : 0;
  const toggle = (k) => setOpen((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));

  return (
    <div className="space-y-3">
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="section-title">QC Alerts — Rework Record</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Every failed O2D checklist answer, by order. {alerts ? `${alerts.length} alert${alerts.length === 1 ? '' : 's'} on ${orders.length} order${orders.length === 1 ? '' : 's'}.` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input className="input !py-1.5 !text-[12px] w-56" placeholder="Order no., check, step, person…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-secondary btn-sm whitespace-nowrap" onClick={() => setShowGroups((v) => !v)}>
            WhatsApp Groups{unsetCount ? ` (${unsetCount} not set)` : ''}
          </button>
        </div>
      </div>

      {showGroups && groups && <GroupsEditor groups={groups} onSaved={setGroups} />}

      {err && <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12.5px] px-3 py-2">{err}</div>}

      {!alerts && !err ? (
        <div className="card p-10 text-center text-slate-400 text-[13px]">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="card p-10 text-center text-slate-500 text-[12.5px]">No QC alerts {q ? 'match that search' : 'raised yet'}.</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr>
                <th className="table-th w-6"></th>
                <th className="table-th">Order</th>
                <th className="table-th text-right">Alerts (rework)</th>
                <th className="table-th">Steps</th>
                <th className="table-th">Last alert</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const isOpen = open.includes(o.orderNo);
                return (
                  <Fragment key={o.orderNo}>
                    <tr className="table-row cursor-pointer" onClick={() => toggle(o.orderNo)}>
                      <td className="table-td text-slate-400">{isOpen ? '▾' : '▸'}</td>
                      <td className="table-td font-semibold text-slate-800">{o.orderNo}</td>
                      <td className="table-td text-right tabular-nums">
                        <span className={`pill ${o.alerts.length > 2 ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>{o.alerts.length}</span>
                      </td>
                      <td className="table-td text-slate-600">{[...o.steps].join(', ') || '—'}</td>
                      <td className="table-td text-slate-500 whitespace-nowrap">{fmt(o.last)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} className="p-0 bg-slate-50/60">
                          <div className="px-3 py-2.5">
                            <table className="w-full text-[12px] bg-white rounded-lg overflow-hidden">
                              <thead>
                                <tr>
                                  {['When', 'Step', 'Check', 'Answer', 'Note', 'Area', 'Sent to', 'Raised by'].map((h) => <th key={h} className="table-th whitespace-nowrap">{h}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {o.alerts.map((a) => (
                                  <tr key={a.id} className="table-row align-top">
                                    <td className="table-td whitespace-nowrap text-slate-500">{fmt(a.created_at)}</td>
                                    <td className="table-td">{a.step_name || a.source || '—'}</td>
                                    <td className="table-td font-medium text-slate-800">{a.check_label}</td>
                                    <td className="table-td text-red-600 font-semibold">{a.answer}</td>
                                    <td className="table-td max-w-[260px]">
                                      {a.note || '—'}
                                      {a.photo && <> · <a href={a.photo} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">photo</a></>}
                                    </td>
                                    <td className="table-td">{a.area || '—'}</td>
                                    <td className="table-td text-slate-600">{a.sent_to || '—'}</td>
                                    <td className="table-td">{a.raised_by || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GroupsEditor({ groups, onSaved }) {
  const [rows, setRows] = useState(() => Object.entries(groups).map(([name, jid]) => ({ name, jid })));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    setSaving(true); setMsg('');
    try {
      const body = { groups: Object.fromEntries(rows.filter((r) => r.name.trim()).map((r) => [r.name.trim(), r.jid.trim()])) };
      const res = await fetch('/api/qc-alerts/groups', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save');
      onSaved(d); setMsg('Saved');
    } catch (e) { setMsg(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="card p-4 space-y-2">
      <div className="text-[12px] text-slate-600">
        Name each WhatsApp group the checklists alert, with its group ID (<code>…@g.us</code>). A checklist field names groups
        like <b>Design, SKM</b>. <b>Stone Order {'{branch}'}</b> picks <i>Stone Order HYD</i> or <i>Stone Order BLR</i> from the order
        number (H… / B…), and <b>HOD {'{material}'}</b> picks e.g. <i>HOD Stone</i> from the row&apos;s material.
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[200px_1fr_auto] gap-2">
          <input className="input !text-[12px]" value={r.name} placeholder="Group name" onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input className={`input !text-[12px] ${r.jid.trim() ? '' : '!border-amber-300 !bg-amber-50/50'}`} value={r.jid} placeholder="e.g. 120363…@g.us (not set — alerts are only logged)"
            onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, jid: e.target.value } : x)))} />
          <button type="button" className="btn-ghost !p-1.5 text-red-500" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button type="button" className="btn-secondary btn-sm" onClick={() => setRows((rs) => [...rs, { name: '', jid: '' }])}>+ Add Group</button>
        <button type="button" className="btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Groups'}</button>
        {msg && <span className="text-[12px] text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}

function fmt(v) {
  const d = new Date(String(v || '').replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(v || '—');
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

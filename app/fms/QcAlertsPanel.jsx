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
  const [showDelay, setShowDelay] = useState(false);

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
          <button className="btn-secondary btn-sm whitespace-nowrap" onClick={() => setShowDelay((v) => !v)}>
            Step Alerts
          </button>
        </div>
      </div>

      {showGroups && groups && <GroupsEditor groups={groups} onSaved={setGroups} />}
      {showDelay && <DelayAlertsEditor groupNames={Object.keys(groups || {})} />}

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

// Per FMS step, which group hears about it (lib/delayAlerts.js): its late
// items and its pending list as one digest per group every morning, and each
// row the moment it's done. "Send now" runs the morning digests on demand.
function DelayAlertsEditor({ groupNames }) {
  const [flows, setFlows] = useState(null);
  const [config, setConfig] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/qc-alerts/delay').then((r) => r.json())
      .then((d) => { if (d.error) setMsg(d.error); else { setFlows(d.flows || []); setConfig(d.config || {}); } })
      .catch((e) => setMsg(e.message));
  }, []);

  async function call(method) {
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/qc-alerts/delay', {
        method, headers: { 'Content-Type': 'application/json' },
        body: method === 'PUT' ? JSON.stringify({ config }) : undefined,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      if (method === 'PUT') { setConfig(d.config); setMsg('Saved'); }
      else {
        const sent = d.groups.map((g) => `${g.name} (${g.kind === 'late' ? 'late' : 'list'}): ${g.items}${g.sent ? '' : ' — not sent'}`).join(' · ');
        setMsg(`${d.overdue} late, ${d.pending} pending. ${sent || 'No group to send to.'}${d.unset.length ? ` Groups without an ID: ${d.unset.join(', ')}.` : ''}`);
      }
    } catch (e) { setMsg(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="text-[12px] text-slate-600">
        For each step, name the group that should hear about it — group names from <b>WhatsApp Groups</b>, several with commas;
        <b>Stone Order {'{branch}'}</b> picks HYD / BLR from the order number. Blank = nothing sent.
        <ul className="list-disc ml-5 mt-1 space-y-0.5">
          <li><b>Late</b> — items past their Planned time, every morning at 10 AM (Mon–Sat): order, client, due date, how late, doer.</li>
          <li><b>Daily list</b> — every item still pending at the step, same time, with how long it has waited (⚠️ past 7 days). E.g. Dispatch → what is packed but not sent.</li>
          <li><b>On done</b> — the moment a row is marked done, its order details (e.g. Packing done → material ready).</li>
        </ul>
      </div>
      <datalist id="delay-groups">{groupNames.map((n) => <option key={n} value={n} />)}</datalist>
      {!flows ? (
        <div className="text-[12px] text-slate-400">{msg || 'Loading…'}</div>
      ) : flows.map((f) => (
        <div key={f.fmsId} className="space-y-1.5">
          <div className="text-[12px] font-semibold text-slate-700">{f.fmsName}</div>
          <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,170px)] gap-2 text-[10.5px] uppercase tracking-wide text-slate-400">
            <span>Step</span><span>Late</span><span>Daily list</span><span>On done</span>
          </div>
          {f.steps.map((s) => (
            <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_repeat(3,170px)] gap-2 items-center">
              <span className="text-[12px] text-slate-600 truncate" title={s.name}>{s.name}</span>
              {['late', 'list', 'done'].map((k) => (
                <input key={k} className="input !py-1 !text-[12px]" list="delay-groups" placeholder="—" value={config[s.id]?.[k] || ''}
                  onChange={(e) => setConfig((c) => ({ ...c, [s.id]: { ...(c[s.id] || {}), [k]: e.target.value } }))} />
              ))}
            </div>
          ))}
        </div>
      ))}
      {flows && (
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <button type="button" className="btn-primary btn-sm" disabled={saving} onClick={() => call('PUT')}>{saving ? 'Working…' : 'Save'}</button>
          <button type="button" className="btn-secondary btn-sm" disabled={saving} onClick={() => call('POST')}>Send now</button>
          {msg && <span className="text-[12px] text-slate-600">{msg}</span>}
        </div>
      )}
    </div>
  );
}

function fmt(v) {
  const d = new Date(String(v || '').replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(v || '—');
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

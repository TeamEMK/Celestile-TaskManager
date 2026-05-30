'use client';
import { useEffect, useMemo, useState } from 'react';

const blankRow = () => ({ client: '', department: '', description: '', minutes: '' });
const todayISO = () => new Date().toISOString().split('T')[0];
const fmt = (iso) => new Date(iso).toLocaleDateString('en-GB').replaceAll('/', '-');

export default function DailyTaskClient({ doerId, doer, departments = [], clients = [] }) {
  const [entryDate, setEntryDate] = useState(todayISO());
  const [rows, setRows] = useState([blankRow()]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [past, setPast] = useState([]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0),
    [rows]
  );

  async function loadPast() {
    if (!doerId) return;
    try {
      const res = await fetch(`/api/daily-tasks?doerId=${doerId}`);
      const data = await res.json();
      setPast(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }
  useEffect(() => { loadPast(); }, [doerId]);

  const setRow = (i, key, val) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const dupRow = (i) => setRows((rs) => [...rs.slice(0, i + 1), { ...rs[i] }, ...rs.slice(i + 1)]);
  const delRow = (i) => setRows((rs) => (rs.length === 1 ? [blankRow()] : rs.filter((_, idx) => idx !== i)));

  async function submitAll() {
    const clean = rows.filter((r) => r.description.trim() || r.client || Number(r.minutes) > 0);
    if (clean.length === 0) { setMsg('Add at least one task row.'); return; }
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/daily-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryDate, doerId, doer, rows: clean }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setMsg('✅ Submitted!');
      setRows([blankRow()]);
      loadPast();
    } catch (e) {
      setMsg('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  // group past entries by date
  const grouped = useMemo(() => {
    const g = {};
    for (const e of past) {
      const k = (e.entryDate || '').split('T')[0];
      (g[k] ||= []).push(e);
    }
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [past]);

  return (
    <div className="space-y-4">

      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="text-[15px] font-semibold text-slate-900">Daily Task</div>
            <div className="text-[12px] text-slate-500">Welcome <b>{doer || 'User'}</b></div>
          </div>
          <div className="text-[12px] text-slate-500">{new Date().toLocaleString('en-GB')}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 max-w-md">
          <div>
            <label className="label">Entry Date</label>
            <input type="date" className="input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Doer</label>
            <input className="input bg-slate-50" value={doer} disabled />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="table-th !text-white">Client</th>
                <th className="table-th !text-white">Department</th>
                <th className="table-th !text-white">Task Description</th>
                <th className="table-th !text-white">Time (min)</th>
                <th className="table-th !text-white text-right pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="table-td">
                    <input className="input" list="dt-clients" placeholder="--select--"
                      value={r.client} onChange={(e) => setRow(i, 'client', e.target.value)} />
                  </td>
                  <td className="table-td">
                    <select className="input" value={r.department} onChange={(e) => setRow(i, 'department', e.target.value)}>
                      <option value="">--select--</option>
                      {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                  <td className="table-td">
                    <textarea className="input min-h-[40px]" rows={1} placeholder="What did you do?"
                      value={r.description} onChange={(e) => setRow(i, 'description', e.target.value)} />
                  </td>
                  <td className="table-td w-24">
                    <input type="number" min="0" className="input" value={r.minutes}
                      onChange={(e) => setRow(i, 'minutes', e.target.value)} />
                  </td>
                  <td className="table-td">
                    <div className="flex gap-1 justify-end">
                      <button className="btn-success" onClick={() => dupRow(i)}>DUP</button>
                      <button className="btn-danger" onClick={() => delRow(i)}>DEL</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="dt-clients">
            {clients.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="flex items-center justify-between mt-3 px-3 py-2 bg-slate-50 rounded-lg">
          <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Total Duration</span>
          <span className="text-[18px] font-bold text-amber-500">{total} <span className="text-[12px] text-slate-400">min</span></span>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          {msg && <span className="text-[12px] mr-auto">{msg}</span>}
          <button className="btn-secondary" onClick={addRow}>+ Add Row</button>
          <button className="btn-warn" disabled={saving} onClick={submitAll}>
            {saving ? 'Submitting…' : 'Submit All →'}
          </button>
        </div>
      </div>

      {/* Past submissions */}
      <div className="card p-5">
        <div className="text-[14px] font-semibold text-slate-900 mb-3">📒 My Past Submissions</div>
        {grouped.length === 0 ? (
          <p className="text-[12.5px] text-slate-400">No submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(([date, entries]) => {
              const dayTotal = entries.reduce((s, e) => s + (Number(e.minutes) || 0), 0);
              return (
                <div key={date} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[13px] font-semibold text-slate-800">📅 {fmt(date)}</span>
                    <span className="pill bg-slate-100 text-slate-600">{entries.length} task</span>
                    <span className="pill bg-amber-50 text-amber-600">{dayTotal} min total</span>
                  </div>
                  {entries.map((e) => (
                    <div key={e.id} className="flex items-start gap-2 text-[12.5px] py-1">
                      {e.client && <span className="pill bg-orange-50 text-orange-600 shrink-0">{e.client}</span>}
                      {e.department && <span className="pill bg-primary-50 text-primary-700 shrink-0">{e.department}</span>}
                      <span className="text-slate-700">{e.description}</span>
                      <span className="ml-auto pill bg-amber-50 text-amber-600 shrink-0">{e.minutes} min</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

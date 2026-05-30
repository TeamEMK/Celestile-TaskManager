'use client';
import { useEffect, useMemo, useState } from 'react';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const iso = (d) => d.toISOString().split('T')[0];
const fmt = (s) => new Date(s).toLocaleDateString('en-GB').replaceAll('/', '-');

export default function MeetingsClient({ createdBy, holidays = [], users = [] }) {
  const [cursor, setCursor] = useState(new Date());      // any date in shown month
  const [selected, setSelected] = useState(iso(new Date()));
  const [meetings, setMeetings] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', startTime: '', endTime: '', attendees: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const holidayMap = useMemo(() => {
    const m = {};
    for (const h of holidays) m[(h.date || '').split('T')[0]] = h.name;
    return m;
  }, [holidays]);

  async function load() {
    const from = iso(new Date(year, month, 1));
    const to = iso(new Date(year, month + 1, 0));
    try {
      const res = await fetch(`/api/meetings?from=${from}&to=${to}`);
      const data = await res.json();
      setMeetings(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, [year, month]);

  // build 6-week grid
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay()); // back to Sunday
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [year, month]);

  const byDate = useMemo(() => {
    const m = {};
    for (const mt of meetings) {
      const k = (mt.date || '').split('T')[0];
      (m[k] ||= []).push(mt);
    }
    return m;
  }, [meetings]);

  const dayMeetings = (byDate[selected] || []).slice().sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  async function schedule() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, date: selected, createdBy }),
      });
      setOpen(false);
      setForm({ title: '', startTime: '', endTime: '', attendees: '', notes: '' });
      load();
    } finally { setSaving(false); }
  }

  async function remove(id) {
    await fetch(`/api/meetings?id=${id}`, { method: 'DELETE' });
    load();
  }

  const move = (delta) => setCursor(new Date(year, month + delta, 1));
  const isSunday = (d) => d.getDay() === 0;

  return (
    <div className="space-y-4">
<div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Calendar */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={() => setCursor(new Date())}>Today</button>
              <button className="btn-secondary" onClick={() => move(-1)}>←</button>
              <button className="btn-secondary" onClick={() => move(1)}>→</button>
              <span className="text-[15px] font-semibold ml-2">{MONTHS[month]} {year}</span>
            </div>
            <button className="btn-primary" onClick={() => setOpen(true)}>+ Schedule</button>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
            {DOW.map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px bg-slate-100 rounded-lg overflow-hidden">
            {cells.map((d, i) => {
              const k = iso(d);
              const inMonth = d.getMonth() === month;
              const isToday = k === iso(new Date());
              const isSel = k === selected;
              const hol = holidayMap[k];
              const cnt = (byDate[k] || []).length;
              return (
                <button key={i} onClick={() => setSelected(k)}
                  className={`min-h-[78px] bg-white p-1.5 text-left relative transition
                    ${inMonth ? '' : 'opacity-40'} ${isSel ? 'ring-2 ring-primary-400 ring-inset' : 'hover:bg-slate-50'}`}>
                  <span className={`inline-grid place-items-center w-6 h-6 rounded-full text-[12px]
                    ${isToday ? 'bg-primary-600 text-white font-semibold' : 'text-slate-700'}`}>{d.getDate()}</span>
                  {hol ? <span className="absolute top-1.5 right-1.5 text-[9px] text-red-500 font-semibold">🏖 Holiday</span>
                    : isSunday(d) && <span className="absolute top-1.5 right-1.5 text-[9px] text-red-400 font-semibold">Off</span>}
                  {cnt > 0 && <span className="mt-1 block pill bg-primary-50 text-primary-700 w-fit">{cnt} mtg</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day panel */}
        <div className="card p-4">
          <div className="text-[13px] font-semibold mb-3">Day · {fmt(selected)}</div>
          {dayMeetings.length === 0 ? (
            <p className="text-center text-[12.5px] text-slate-400 py-8">No meetings on this date</p>
          ) : (
            <div className="space-y-2">
              {dayMeetings.map((m) => (
                <div key={m.id} className="border border-slate-200 rounded-lg p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-[13px] text-slate-800">{m.title}</div>
                    <button className="text-red-500 text-[11px] hover:underline" onClick={() => remove(m.id)}>Delete</button>
                  </div>
                  <div className="text-[11.5px] text-slate-500 mt-0.5">
                    {(m.startTime || '—')}{m.endTime ? ` – ${m.endTime}` : ''}
                  </div>
                  {m.attendees && <div className="text-[11.5px] text-slate-500 mt-0.5">👥 {m.attendees}</div>}
                  {m.notes && <div className="text-[11.5px] text-slate-600 mt-1">{m.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="card p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold mb-1">Schedule Meeting</div>
            <div className="text-[12px] text-slate-500 mb-4">on {fmt(selected)}</div>
            <div className="space-y-3">
              <div><label className="label">Title</label>
                <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Start</label>
                  <input type="time" className="input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
                <div><label className="label">End</label>
                  <input type="time" className="input" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
              </div>
              <div><label className="label">Attendees</label>
                <input className="input" list="mtg-users" placeholder="comma separated names"
                  value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} />
                <datalist id="mtg-users">{users.map((u) => <option key={u} value={u} />)}</datalist>
              </div>
              <div><label className="label">Notes</label>
                <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={schedule}>{saving ? 'Saving…' : 'Schedule'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

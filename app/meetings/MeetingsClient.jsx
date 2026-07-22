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
    <div className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Calendar */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-slate-50/80 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconCalendar /></div>
              <div>
                <h2 className="text-[13.5px] font-semibold text-slate-900">{MONTHS[month]} {year}</h2>
                <p className="text-[11.5px] text-slate-500">Team meeting calendar</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="seg">
                <button className="seg-btn" onClick={() => setCursor(new Date())}>Today</button>
                <button className="seg-btn" onClick={() => move(-1)}>&larr;</button>
                <button className="seg-btn" onClick={() => move(1)}>&rarr;</button>
              </div>
              <button className="btn-primary" onClick={() => setOpen(true)}><IconPlus /> Schedule</button>
            </div>
          </div>

          <div className="p-4">
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
                    <span className={`inline-grid place-items-center w-6 h-6 rounded-full text-[12px] transition
                      ${isToday ? 'bg-primary-600 text-white font-semibold shadow-sm shadow-primary-600/30' : 'text-slate-700'}`}>{d.getDate()}</span>
                    {hol ? <span className="absolute top-1.5 right-1.5 pill !px-1.5 !py-0 bg-red-50 text-red-500 text-[8.5px]">Holiday</span>
                      : isSunday(d) && <span className="absolute top-1.5 right-1.5 pill !px-1.5 !py-0 bg-slate-100 text-red-400 text-[8.5px]">Off</span>}
                    {cnt > 0 && <span className="mt-1 block pill bg-primary-50 text-primary-700 w-fit">{cnt} mtg</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Day panel */}
        <div className="card overflow-hidden flex flex-col">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-gradient-to-r from-slate-50/80 to-transparent">
            <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 grid place-items-center shrink-0"><IconList /></div>
            <div>
              <h3 className="text-[13.5px] font-semibold text-slate-900">Day Agenda</h3>
              <p className="text-[11.5px] text-slate-500">{fmt(selected)}</p>
            </div>
          </div>
          <div className="p-4">
            {dayMeetings.length === 0 ? (
              <div className="py-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 grid place-items-center mx-auto mb-3">
                  <IconCalendar className="w-6 h-6 text-slate-300" />
                </div>
                <div className="text-[13px] font-semibold text-slate-700">No meetings scheduled</div>
                <div className="text-[11.5px] text-slate-500 mt-0.5">Nothing on this date yet.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {dayMeetings.map((m) => (
                  <div key={m.id} className="group rounded-lg border border-slate-200 p-2.5 transition hover:border-primary-200 hover:bg-primary-50/30">
                    <div className="flex items-start gap-2.5">
                      <div className="shrink-0 rounded-lg bg-primary-50 text-primary-700 text-center px-2 py-1 min-w-[52px]">
                        <div className="text-[12px] font-bold leading-none">{m.startTime || '—'}</div>
                        {m.endTime && <div className="text-[9px] text-primary-500 mt-0.5">to {m.endTime}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-[13px] text-slate-800 truncate">{m.title}</div>
                          <button className="text-red-500 text-[11px] hover:underline shrink-0 opacity-70 group-hover:opacity-100 transition" onClick={() => remove(m.id)}>Delete</button>
                        </div>
                        {m.attendees && (
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                            <IconUsers /> <span className="truncate">{m.attendees}</span>
                          </div>
                        )}
                        {m.notes && <div className="text-[11px] text-slate-600 mt-1">{m.notes}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={() => !saving && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-primary-50 text-primary-600"><IconCalendar /></div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900">Schedule Meeting</h2>
                <p className="text-xs text-slate-500 mt-0.5">on {fmt(selected)}</p>
              </div>
              <button onClick={() => setOpen(false)} disabled={saving} className="btn-ghost w-8 h-8 !p-0 shrink-0">
                <IconClose />
              </button>
            </div>
            <div className="p-6 space-y-3">
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
                <textarea className="input resize-none" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button className="btn-secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={schedule}>{saving ? 'Saving…' : 'Schedule'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconPlus()     { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function IconClose()    { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>; }
function IconList()     { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>; }
function IconUsers()    { return <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconCalendar({ className = 'w-5 h-5' }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }

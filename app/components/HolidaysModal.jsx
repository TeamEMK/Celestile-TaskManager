'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useConfirmToast } from './ConfirmToast';
import Icon from './Icon';
import DateField from './DateField';

const fmt = (d) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric', weekday: 'long',
  });
const dayParts = (d) => {
  const dt = new Date(d);
  return { day: dt.getDate(), mon: dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() };
};

function IconCalendar(props) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function IconTrash(props) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>; }
function IconFolder(props){ return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h5l2 2h9a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>; }
function IconUpload(props){ return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>; }
function IconDownload(props){ return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>; }
function IconPlus(props)  { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }

// CSV parser supporting: date,name per line, optional header row.
function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  // skip header if first row clearly looks like one
  const first = lines[0].toLowerCase();
  const start = (first.startsWith('date') && first.includes('name')) ? 1 : 0;
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const [d, ...rest] = lines[i].split(',');
    if (!d) continue;
    out.push({ date: d.trim(), name: rest.join(',').trim() });
  }
  return out;
}

export default function HolidaysModal({ open, onClose, holidays: initial = [] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user?.roles || []).includes('Admin') || (session?.user?.roles || []).includes('HOD');
  const [list, setList] = useState(initial);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const { ask, ConfirmUI } = useConfirmToast();
  // { text, ok } — see AddDelegateModal: a prefix sniffed off the string
  // made every un-prefixed validation error render as a success.
  const [msg, setMsg] = useState(null);
  const [file, setFile] = useState(null);

  // refresh from server whenever modal opens
  useEffect(() => {
    if (!open) return;
    setMsg(null);
    fetch('/api/holidays').then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setList(d);
    }).catch(() => {});
  }, [open]);

  if (!open) return null;

  async function addOne() {
    if (!date || !name.trim()) { setMsg({ text: 'Date and Holiday Name are required.', ok: false }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, name: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setDate(''); setName('');
      const d = await fetch('/api/holidays').then((r) => r.json());
      if (Array.isArray(d)) setList(d);
      setMsg({ text: 'Added', ok: true });
      router.refresh();
    } catch (e) {
      setMsg({ text: e.message, ok: false });
    } finally { setSaving(false); }
  }

  function remove(id) {
    ask('Remove this holiday?', async () => {
      await fetch(`/api/holidays?id=${id}`, { method: 'DELETE' });
      setList((xs) => xs.filter((h) => h.id !== id));
      router.refresh();
    });
  }

  async function uploadCsv() {
    if (!file) { setMsg({ text: 'Please choose a file first.', ok: false }); return; }
    setSaving(true); setMsg(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { setMsg({ text: 'No valid rows found in CSV.', ok: false }); setSaving(false); return; }
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: rows }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Upload failed');
      setMsg({ text: `${out.inserted} added${out.skipped ? `, ${out.skipped} skipped` : ''}`, ok: true });
      setFile(null);
      const d = await fetch('/api/holidays').then((r) => r.json());
      if (Array.isArray(d)) setList(d);
      router.refresh();
    } catch (e) {
      setMsg({ text: e.message, ok: false });
    } finally { setSaving(false); }
  }

  function downloadSample() {
    const csv = 'date,name\n2026-01-26,Republic Day\n15-08-2026,Independence Day\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'holidays-sample.csv';
    a.click();
  }

  return (
    <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-elevated w-full max-w-lg max-h-[90vh] flex flex-col animate-pop-in" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 grid place-items-center shrink-0">
            <IconCalendar className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">Holidays</h2>
            <p className="text-[11.5px] text-slate-500 mt-0.5">{list.length} holiday{list.length === 1 ? '' : 's'} on record</p>
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 !p-0 shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* body */}
        <div className="p-5 space-y-4 overflow-y-auto">

          {/* Admin-only: add holiday + bulk upload */}
          {isAdmin && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date</label>
                  <DateField className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Holiday Name</label>
                  <input className="input" placeholder="e.g. Diwali" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              </div>
              <button className="btn-primary w-full" disabled={saving} onClick={addOne}>
                {saving
                  ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg> Saving…</>
                  : <><IconPlus className="w-3.5 h-3.5" /> Add Holiday</>}
              </button>

              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-[13px]"><IconFolder className="w-4 h-4" /> Bulk Upload (CSV)</div>
                <div className="text-[11.5px] text-amber-700/80 mt-0.5">
                  Format: <code>date,name</code> per line — date as YYYY-MM-DD or DD-MM-YYYY
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button className="btn-secondary" onClick={downloadSample}><IconDownload className="w-3.5 h-3.5" /> Sample</button>
                  <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="text-[12px] file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
                  <button className="btn-success ml-auto" disabled={saving || !file} onClick={uploadCsv}><IconUpload className="w-3.5 h-3.5" /> Upload CSV</button>
                </div>
              </div>

              {msg && (
                <div className={`text-[12px] rounded-lg px-3 py-2 border flex items-center gap-1.5 ${msg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                  <Icon name={msg.ok ? 'check' : 'alert'} className="w-3.5 h-3.5" />
                  {msg.text}
                </div>
              )}
            </>
          )}

          {/* Holiday list — visible to all */}
          <div>
            <div className="label !mb-2">
              Holiday List ({list.length})
            </div>
            {list.length === 0 ? (
              <div className="py-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-3">
                  <IconCalendar className="w-6 h-6 text-slate-400" />
                </div>
                <div className="text-[12.5px] text-slate-400">No holidays added.</div>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {list.map((h) => {
                  const { day, mon } = dayParts(h.date);
                  return (
                    <li key={h.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 hover:border-amber-200 hover:bg-amber-50/40 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 grid place-items-center shrink-0 leading-none">
                        <div className="text-center">
                          <div className="text-[13px] font-bold text-slate-800">{day}</div>
                          <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-400">{mon}</div>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-slate-800 truncate">{h.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{fmt(h.date)}</div>
                      </div>
                      {isAdmin && (
                        <button className="btn-ghost !text-red-500 hover:!bg-red-50 hover:!text-red-600 w-8 h-8 !p-0 shrink-0" onClick={() => remove(h.id)} title="Remove holiday">
                          <IconTrash className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="px-5 py-3 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
      {ConfirmUI}
    </div>
  );
}
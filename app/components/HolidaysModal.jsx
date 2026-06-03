'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useConfirmToast } from './ConfirmToast';

const fmt = (d) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric', weekday: 'long',
  });

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
  const [msg, setMsg] = useState('');
  const [file, setFile] = useState(null);

  // refresh from server whenever modal opens
  useEffect(() => {
    if (!open) return;
    setMsg('');
    fetch('/api/holidays').then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setList(d);
    }).catch(() => {});
  }, [open]);

  if (!open) return null;

  async function addOne() {
    if (!date || !name.trim()) { setMsg('Date and Holiday Name are required.'); return; }
    setSaving(true); setMsg('');
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
      setMsg('✅ Added');
      router.refresh();
    } catch (e) {
      setMsg('❌ ' + e.message);
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
    if (!file) { setMsg('Please choose a file first.'); return; }
    setSaving(true); setMsg('');
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { setMsg('No valid rows found in CSV.'); setSaving(false); return; }
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: rows }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Upload failed');
      setMsg(`✅ ${out.inserted} added${out.skipped ? `, ${out.skipped} skipped` : ''}`);
      setFile(null);
      const d = await fetch('/api/holidays').then((r) => r.json());
      if (Array.isArray(d)) setList(d);
      router.refresh();
    } catch (e) {
      setMsg('❌ ' + e.message);
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
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-pop-in" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 grid place-items-center">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </div>
          <h2 className="flex-1 text-base font-semibold text-slate-900">📅 Holidays</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700">
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
                  <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Holiday Name</label>
                  <input className="input" placeholder="e.g. Diwali" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              </div>
              <button className="btn-primary w-full" disabled={saving} onClick={addOne}>
                {saving ? 'Saving…' : '+ Add Holiday'}
              </button>

              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-[13px]">📁 Bulk Upload (CSV)</div>
                <div className="text-[11.5px] text-amber-700/80 mt-0.5">
                  Format: <code>date,name</code> per line — date as YYYY-MM-DD or DD-MM-YYYY
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button className="btn-secondary" onClick={downloadSample}>⬇ Sample</button>
                  <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="text-[12px] file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
                  <button className="btn-success ml-auto" disabled={saving || !file} onClick={uploadCsv}>📤 Upload CSV</button>
                </div>
              </div>

              {msg && <div className="text-[12px] text-slate-600">{msg}</div>}
            </>
          )}

          {/* Holiday list — visible to all */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
              Holiday List ({list.length})
            </div>
            {list.length === 0 ? (
              <div className="py-6 text-center text-[12.5px] text-slate-400">No holidays added.</div>
            ) : (
              <ul className="space-y-1.5">
                {list.map((h) => (
                  <li key={h.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-[13px]">
                      <span className="font-semibold text-slate-800">{fmt(h.date)}</span>
                      <span className="text-slate-500"> — {h.name}</span>
                    </div>
                    {isAdmin && (
                      <button className="btn-danger" onClick={() => remove(h.id)}>Remove</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
      {ConfirmUI}
    </div>
  );
}
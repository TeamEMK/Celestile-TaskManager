'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isImageAttachment } from '@/lib/attachmentType';
import { ZoomImg } from './ImageLightbox';

const FREQS = [
  { label: 'Daily (365 tasks/year)',            value: 'Daily'            },
  { label: 'Weekly (52 tasks/year)',             value: 'Weekly'           },
  { label: 'Alternative Week (26 tasks/year)',   value: 'Alternative Week' },
  { label: 'Monthly (12 tasks/year)',            value: 'Monthly'          },
  { label: 'Quarterly (4 tasks/year)',           value: 'Quarterly'        },
  { label: 'Yearly (1 task/year)',               value: 'Yearly'           },
];

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const looksHeader = header.includes('user_email') || header.includes('description');
  const cols = looksHeader ? header : ['user_email', 'frequency', 'start_date', 'description', 'remarks'];
  const start = looksHeader ? 1 : 0;
  return lines.slice(start).map((line) => {
    const parts = line.split(',');
    const row = {};
    cols.forEach((c, i) => { row[c] = (parts[i] || '').trim(); });
    return row;
  });
}

export default function AddMasterModal({ open, onClose, users: propUsers = [] }) {
  const router = useRouter();
  const [users, setUsers] = useState(propUsers);

  useEffect(() => {
    if (!open) return;
    fetch('/api/users').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setUsers(d.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const [form, setForm] = useState({
    assignedTo: '', frequency: 'Daily',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '', task: '', remarks: '',
    attachment: '', requireFile: false,
  });
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');

  if (!open) return null;

  async function pickAttachment(f) {
    if (!f) return;
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(f);
      });
      setForm((prev) => ({ ...prev, attachment: dataUrl }));
    } catch {}
  }

  async function save() {
    if (!form.task.trim()) { alert('Task name is required'); return; }
    if (!form.assignedTo)  { alert('Please select an employee'); return; }
    setSaving(true);
    const res = await fetch('/api/masters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: form.task, assignedTo: form.assignedTo,
        frequency: form.frequency, startDate: form.startDate,
        endDate: form.endDate || null, remarks: form.remarks,
        requireFile: form.requireFile ? 1 : 0,
        attachment: form.attachment || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ assignedTo: '', frequency: 'Daily', startDate: new Date().toISOString().slice(0, 10), endDate: '', task: '', remarks: '', attachment: '', requireFile: false });
      onClose();
      router.refresh();
    } else {
      const d = await res.json();
      alert(d.error || 'Something went wrong');
    }
  }

  async function uploadCsv() {
    if (!file) { setMsg('Please choose a CSV file first.'); return; }
    setSaving(true); setMsg('');
    try {
      const rows = parseCSV(await file.text());
      if (!rows.length) { setMsg('No valid rows found.'); setSaving(false); return; }
      let inserted = 0; const errors = [];
      for (const [i, row] of rows.entries()) {
        const email = (row.user_email || '').trim().toLowerCase();
        const desc  = (row.description || '').trim();
        if (!email || !desc) { errors.push(`Row ${i + 1}: missing fields`); continue; }
        const user = users.find(u => u.email?.toLowerCase() === email);
        if (!user) { errors.push(`Row ${i + 1}: user not found (${email})`); continue; }
        const freq = FREQS.find(f => f.value.toLowerCase() === (row.frequency || '').toLowerCase())?.value || 'Daily';
        const res = await fetch('/api/masters', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: desc, assignedTo: user.name, frequency: freq,
            startDate: row.start_date || new Date().toISOString().slice(0, 10),
            remarks: row.remarks || '',
          }),
        });
        if (res.ok) inserted++; else errors.push(`Row ${i + 1}: save failed`);
      }
      setMsg(`✅ ${inserted} added${errors.length ? ` · ${errors.length} skipped` : ''}`);
      setFile(null);
      router.refresh();
    } catch (e) {
      setMsg('❌ ' + e.message);
    } finally { setSaving(false); }
  }

  function downloadSample() {
    const csv =
      'user_email,frequency,start_date,description,remarks\n' +
      'priyanka@test.com,daily,2026-04-01,Review attendance sheet,\n' +
      'pooja@test.com,weekly,2026-04-01,Send weekly report,\n' +
      'rahul@test.com,monthly,2026-04-01,Submit monthly expense report,April month\n' +
      'neha@test.com,yearly,2026-04-01,Annual performance self-review,\n' +
      'amit@test.com,alternative_week,2026-04-01,Bi-weekly team sync notes,\n' +
      'sneha@test.com,quarterly,2026-04-01,Quarterly audit checklist,Q2 2026\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'checklist-sample.csv';
    a.click();
  }

  return (
    <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/></svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">+ Add Checklist Task</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Define a recurring item for the team</p>
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 !p-0 shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Select Employee *</label>
            <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className="input !text-[14px]">
              <option value="">Select Employee</option>
              {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Frequency</label>
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="input !text-[14px]">
              {FREQS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date</label>
              <input type="date" value={form.startDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input !text-[14px]" />
            </div>
            <div>
              <label className="label">End Date <span className="text-slate-400">(Optional)</span></label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input !text-[14px]" />
            </div>
          </div>

          <div>
            <label className="label">Task Name / Description</label>
            <input value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} placeholder="Enter task name..." className="input !text-[14px]" />
          </div>

          <div>
            <label className="label">Remarks</label>
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Any remarks..." className="input !text-[14px]" />
          </div>

          <div>
            <label className="label">Photo / PDF <span className="text-slate-400 font-normal">(optional)</span></label>
            <div className="flex items-center gap-3">
              {isImageAttachment(form.attachment) ? (
                <ZoomImg src={form.attachment} className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0" />
              ) : (
                <label className="cursor-pointer flex items-center justify-center w-16 h-16 rounded-xl border border-dashed border-slate-300 overflow-hidden hover:border-primary-400 transition-colors shrink-0">
                  {form.attachment
                    ? <span className="text-2xl">📄</span>
                    : <span className="text-slate-400 text-xl leading-none">+</span>}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pickAttachment(e.target.files?.[0])} />
                </label>
              )}
              {form.attachment && (
                <div className="flex flex-col gap-1">
                  {isImageAttachment(form.attachment) ? (
                    <label className="text-[12px] text-primary-600 hover:underline cursor-pointer">
                      Change photo
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pickAttachment(e.target.files?.[0])} />
                    </label>
                  ) : (
                    <a href={form.attachment} target="_blank" rel="noopener noreferrer" className="text-[12px] text-primary-600 hover:underline">View PDF</a>
                  )}
                  <button type="button" className="text-[12px] text-red-500 hover:text-red-600 text-left" onClick={() => setForm((p) => ({ ...p, attachment: '' }))}>Remove</button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 py-1">
            <input
              type="checkbox" id="chk-requireFile"
              checked={form.requireFile}
              onChange={(e) => setForm((p) => ({ ...p, requireFile: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300 accent-primary-600 cursor-pointer"
            />
            <label htmlFor="chk-requireFile" className="text-[13px] text-slate-700 cursor-pointer select-none">
              Require file upload to mark this task done
            </label>
          </div>

          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3">
            <div className="text-center text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">or bulk upload CSV</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file" accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-[12px] file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-slate-700 hover:file:bg-slate-50"
              />
              <button className="btn-success" disabled={saving || !file} onClick={uploadCsv}>⬆ Upload CSV</button>
              <button className="btn-secondary" onClick={downloadSample}>⬇ Sample</button>
            </div>
            <div className="text-[10.5px] text-slate-400 mt-2">
              Format: user_email, frequency (daily/weekly/monthly/yearly/quarterly/alternative_week), start_date, description, remarks — tasks auto-generate!
            </div>
          </div>

          {msg && <div className="text-[12px] text-slate-600">{msg}</div>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={save} disabled={saving} className="btn-success">{saving ? 'Saving…' : 'Generate Tasks'}</button>
        </div>
      </div>
    </div>
  );
}

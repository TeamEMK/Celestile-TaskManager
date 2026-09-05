'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fileToThumbnail, fileToDataUrl } from '@/app/quotation/imageThumb';
import { ZoomImg } from './ImageLightbox';
import Icon from '../components/Icon';
import DateField from './DateField';

const blank = () => ({
  description: '', doerId: '', dueDate: '', client: '',
  priority: 'Low', approval: 'No Approval', approverId: '',
  url: '', remarks: '', image: '',
  attachment: '', requireFile: false,
});


function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const looksHeader = header.includes('doer_email') || header.includes('description');
  const cols = looksHeader ? header : ['doer_email', 'due_date', 'priority', 'approval', 'description', 'remarks', 'client_name'];
  const start = looksHeader ? 1 : 0;
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const row = {};
    cols.forEach((c, idx) => { row[c] = (parts[idx] || '').trim(); });
    out.push(row);
  }
  return out;
}

const Field = ({ label, required, children }) => (
  <div>
    <label className="label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
    {children}
  </div>
);

export default function AddDelegateModal({ open, onClose, users: propUsers = [] }) {
  const router = useRouter();
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  // { text, ok } — never a bare string: the colour must come from the
  // outcome, not from sniffing a prefix off the message.
  const [msg, setMsg] = useState(null);
  const [file, setFile] = useState(null);
  const [users, setUsers] = useState(propUsers);
  const [csvOpen, setCsvOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/users').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setUsers(d.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    }).catch(() => {});
  }, [open]);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function pickAttachment(f) {
    if (!f) return;
    try {
      if (f.type === 'application/pdf') {
        set('attachment', await fileToDataUrl(f));
        set('image', '');
      } else {
        set('image', await fileToThumbnail(f, 700, 0.7));
        set('attachment', '');
      }
    } catch {}
  }

  async function save() {
    if (!form.description.trim() || !form.doerId || !form.dueDate) {
      setMsg({ text: 'Description, Doer and Due Date are required.', ok: false });
      return;
    }
    if (form.approval === 'Approval Required' && !form.approverId) {
      setMsg({ text: 'Please select an approver.', ok: false });
      return;
    }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/delegations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // delegatedBy is derived server-side from the authenticated session,
        // not sent from here — see app/api/delegations/route.js.
        body: JSON.stringify({ ...form, requireFile: form.requireFile ? 1 : 0 }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setForm(blank());
      onClose();
      router.refresh();
    } catch (e) {
      setMsg({ text: e.message, ok: false });
    } finally { setSaving(false); }
  }

  async function uploadCsv() {
    if (!file) { setMsg({ text: 'Please choose a CSV file first.', ok: false }); return; }
    setSaving(true); setMsg(null);
    try {
      const rows = parseCSV(await file.text());
      if (!rows.length) { setMsg({ text: 'No valid rows found in CSV.', ok: false }); setSaving(false); return; }
      const res = await fetch('/api/delegations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: rows }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Upload failed');
      setMsg({ text: `${out.inserted} added${out.errors?.length ? ` · ${out.errors.length} skipped` : ''}`, ok: true });
      setFile(null);
      router.refresh();
    } catch (e) {
      setMsg({ text: e.message, ok: false });
    } finally { setSaving(false); }
  }

  function downloadSample() {
    const csv =
      'doer_email,approver_email,due_date,priority,approval,description,remarks,client_name\n' +
      'someone@example.com,manager@example.com,2026-06-15,High,Approval Required,Finish landing page,Urgent,Ambraee\n' +
      'john@example.com,,2026-06-20,Low,No Approval,Update weekly report,,Sohan Health Care\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'delegation-sample.csv';
    a.click();
  }

  const hasAttachment = form.image || form.attachment;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-pop-in"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="m17 11 2 2 4-4"/>
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">Delegate Task</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Assign new work to a team member</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-3.5">

          <div className="grid grid-cols-2 gap-3">
            <Field label="Assign To" required>
              <select className="input" value={form.doerId} onChange={(e) => set('doerId', e.target.value)}>
                <option value="">Select person</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Due Date" required>
              <DateField className="input" value={form.dueDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => set('dueDate', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                {['Low', 'Medium', 'High'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Approval">
              <select
                className="input"
                value={form.approval}
                onChange={(e) => { const a = e.target.value; setForm((f) => ({ ...f, approval: a, approverId: a === 'Approval Required' ? f.approverId : '' })); }}
              >
                <option value="No Approval">No Approval</option>
                <option value="Approval Required">Yes Approval</option>
              </select>
            </Field>
          </div>

          {form.approval === 'Approval Required' && (
            <Field label="Approver" required>
              <select className="input" value={form.approverId} onChange={(e) => set('approverId', e.target.value)}>
                <option value="">Select approver</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <p className="text-[10.5px] text-slate-400 mt-1">Task will wait for this person's approval once marked done.</p>
            </Field>
          )}

          <Field label="Description" required>
            <textarea className="input resize-none" value={form.description} rows={2} onChange={(e) => set('description', e.target.value)} placeholder="What needs to be done?" />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Client">
              <input className="input" value={form.client} onChange={(e) => set('client', e.target.value)} placeholder="Client name" />
            </Field>
            <Field label="URL">
              <input className="input" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://..." />
            </Field>
            <Field label="Remarks">
              <input className="input" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Notes..." />
            </Field>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60">
            <label className="flex items-center gap-2 px-2.5 py-1.5 border border-dashed border-primary-200 rounded-lg cursor-pointer bg-white hover:bg-primary-50 hover:border-primary-300 transition-colors shrink-0">
              <div className="w-7 h-7 rounded-md bg-primary-50 grid place-items-center overflow-hidden shrink-0">
                {form.image
                  ? <ZoomImg src={form.image} className="w-7 h-7 object-cover" />
                  : form.attachment
                  ? <span className="text-sm"><Icon name="file" className="w-3.5 h-3.5" /></span>
                  : <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                }
              </div>
              <span className="text-[11.5px] font-semibold text-primary-800 whitespace-nowrap">
                {hasAttachment ? 'Change' : '+ Attach'}
              </span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pickAttachment(e.target.files?.[0])} />
            </label>

            {hasAttachment && (
              <div className="flex gap-3 items-center">
                {form.attachment && <a href={form.attachment} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary-600 hover:underline">View PDF</a>}
                <button type="button" onClick={() => { set('image',''); set('attachment',''); }} className="text-[11px] text-red-500 hover:text-red-600 bg-transparent border-none cursor-pointer p-0"><Icon name="x" className="w-3.5 h-3.5" /> Remove</button>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="relative inline-flex h-[18px] w-8 shrink-0">
                  <input type="checkbox" checked={form.requireFile} onChange={(e) => set('requireFile', e.target.checked)} className="sr-only" />
                  <span className={`absolute inset-0 rounded-full transition-colors ${form.requireFile ? 'bg-primary-600' : 'bg-slate-300'}`} />
                  <span className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${form.requireFile ? 'translate-x-3.5' : 'translate-x-0'}`} />
                </span>
                <span className={`text-[11.5px] font-semibold whitespace-nowrap ${form.requireFile ? 'text-primary-700' : 'text-slate-500'}`}>File required</span>
              </label>
            </div>
          </div>

          {msg && (
            <div className={`text-[12px] px-3 py-2 rounded-lg border flex items-center gap-1.5 ${msg.ok ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
              <Icon name={msg.ok ? 'check' : 'alert'} className="w-3.5 h-3.5" />
              {msg.text}
            </div>
          )}

          <div className="rounded-xl border border-dashed border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setCsvOpen(v => !v)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border-none cursor-pointer flex items-center justify-between text-[11.5px] font-semibold text-slate-500"
            >
              <span>Bulk Upload via CSV</span>
              <svg className={`w-3 h-3 transition-transform ${csvOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {csvOpen && (
              <div className="p-3.5 bg-white border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="text-[12px] flex-1 min-w-0 file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1 file:text-[11px] file:font-medium file:text-slate-700 hover:file:bg-slate-50 file:transition-colors" />
                  <button className="btn-success" disabled={saving || !file} onClick={uploadCsv}><Icon name="arrowUp" className="w-3.5 h-3.5" /> Upload</button>
                  <button className="btn-secondary" onClick={downloadSample}><Icon name="arrowDown" className="w-3.5 h-3.5" /> Sample</button>
                </div>
                <div className="text-[10.5px] text-slate-400 mt-1.5">
                  Format: doer_email, approver_email (if approval required), due_date, priority, approval, description, remarks, client_name
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Assigning…' : 'Assign Task'}</button>
        </div>
      </div>
    </div>
  );
}

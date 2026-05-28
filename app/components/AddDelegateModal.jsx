'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const blank = () => ({
  description: '', doerId: '', dueDate: '',
  priority: 'Low', approval: 'No Approval', url: '', remarks: '',
});

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const looksHeader = header.includes('doer_email') || header.includes('description');
  const cols = looksHeader ? header : ['doer_email', 'due_date', 'priority', 'approval', 'description', 'remarks', 'url'];
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

export default function AddDelegateModal({ open, onClose, users = [] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [file, setFile] = useState(null);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.description.trim() || !form.doerId || !form.dueDate) {
      setMsg('Description, Doer aur Due Date zaroori hain.');
      return;
    }
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/delegations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, delegatedBy: session?.user?.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setForm(blank());
      onClose();
      router.refresh();
    } catch (e) {
      setMsg('❌ ' + e.message);
    } finally { setSaving(false); }
  }

  async function uploadCsv() {
    if (!file) { setMsg('Pehle CSV file choose karo.'); return; }
    setSaving(true); setMsg('');
    try {
      const rows = parseCSV(await file.text());
      if (!rows.length) { setMsg('CSV me koi valid row nahi.'); setSaving(false); return; }
      const res = await fetch('/api/delegations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: rows, delegatedBy: session?.user?.id }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Upload failed');
      setMsg(`✅ ${out.inserted} added${out.errors?.length ? ` · ${out.errors.length} skipped` : ''}`);
      setFile(null);
      router.refresh();
    } catch (e) {
      setMsg('❌ ' + e.message);
    } finally { setSaving(false); }
  }

  function downloadSample() {
    const csv =
      'doer_email,due_date,priority,approval,description,remarks,url\n' +
      'someone@example.com,2026-06-15,High,Approval Required,Finish landing page,Urgent,https://docs.google.com/...\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'delegation-sample.csv';
    a.click();
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col animate-pop-in" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 grid place-items-center">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 11 2 2 4-4"/></svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">Delegate Task</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Assign new work to a team member</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Doer (Assign To) *</label>
              <select value={form.doerId} onChange={(e) => set('doerId', e.target.value)} className="input">
                <option value="">— Select —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Due Date *</label>
              <input type="date" value={form.dueDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => set('dueDate', e.target.value)} className="input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Priority</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className="input">
                <option>Low</option><option>Medium</option><option>High</option>
              </select>
            </div>
            <div>
              <label className="label">Approval Required</label>
              <select value={form.approval} onChange={(e) => set('approval', e.target.value)} className="input">
                <option>No Approval</option><option>Approval Required</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Description *</label>
            <textarea value={form.description} rows={3} onChange={(e) => set('description', e.target.value)} className="input resize-none" placeholder="What needs to be done?" />
          </div>

          <div>
            <label className="label">URL <span className="text-slate-400 font-normal">(optional)</span></label>
            <input value={form.url} onChange={(e) => set('url', e.target.value)} className="input" placeholder="https://docs.google.com/..." />
          </div>

          <div>
            <label className="label">Remarks</label>
            <textarea value={form.remarks} rows={2} onChange={(e) => set('remarks', e.target.value)} className="input resize-none" placeholder="Any remarks..." />
          </div>

          {msg && <div className="text-[12px] text-slate-600">{msg}</div>}

          {/* bulk CSV */}
          <div className="rounded-lg border border-dashed border-slate-200 p-3">
            <div className="text-center text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">or bulk upload CSV</div>
            <div className="flex flex-wrap items-center gap-2">
              <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-[12px] file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
              <button className="btn-success" disabled={saving || !file} onClick={uploadCsv}>⬆ Upload CSV</button>
              <button className="btn-secondary" onClick={downloadSample}>⬇ Sample</button>
            </div>
            <div className="text-[10.5px] text-slate-400 mt-2">
              Format: doer_email, due_date, priority, approval, description, remarks, url
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Assigning…' : 'Assign'}</button>
        </div>
      </div>
    </div>
  );
}
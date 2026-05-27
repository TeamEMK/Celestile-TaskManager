'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AddDelegateModal({ open, onClose, users = [] }) {
  const router = useRouter();
  const [form, setForm] = useState({ description: '', doerId: '', dueDate: '' });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function save() {
    if (!form.description.trim() || !form.doerId || !form.dueDate) {
      alert('Description, Doer and Due Date are required');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/delegations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ description: '', doerId: '', dueDate: '' });
      onClose();
      router.refresh();
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-pop-in" onClick={(e) => e.stopPropagation()}>
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
        <div className="p-6 space-y-4">
          <div>
            <label className="label">Description *</label>
            <textarea value={form.description} rows={3} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input resize-none" placeholder="What needs to be done?" />
          </div>
          <div>
            <label className="label">Doer *</label>
            <select value={form.doerId} onChange={(e) => setForm({ ...form, doerId: e.target.value })} className="input">
              <option value="">— Select —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Due Date *</label>
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="input" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Delegating…' : 'Delegate Task'}</button>
        </div>
      </div>
    </div>
  );
}
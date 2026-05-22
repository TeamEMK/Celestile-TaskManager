'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const FREQS = ['Daily', 'Weekly', 'Monthly', 'One-time'];

export default function AddMasterModal({ open, onClose }) {
  const router = useRouter();
  const [form, setForm] = useState({ task: '', assignedTo: '', frequency: 'Daily' });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function save() {
    if (!form.task.trim()) { alert('Task is required'); return; }
    setSaving(true);
    const res = await fetch('/api/masters', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ task: '', assignedTo: '', frequency: 'Daily' });
      onClose();
      router.refresh();
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/></svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">Add Checklist Task</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Define a recurring item for the team</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="label">Task *</label>
            <textarea value={form.task} rows={3} onChange={(e) => setForm({ ...form, task: e.target.value })} className="input resize-none" />
          </div>
          <div>
            <label className="label">Assigned To</label>
            <input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Frequency</label>
            <div className="flex gap-2 flex-wrap">
              {FREQS.map((f) => (
                <button
                  key={f}
                  onClick={() => setForm({ ...form, frequency: f })}
                  className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition ${
                    form.frequency === f
                      ? 'bg-primary-50 text-primary-700 border-primary-200'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Task'}</button>
        </div>
      </div>
    </div>
  );
}

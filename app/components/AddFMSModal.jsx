'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AddFMSModal({ open, onClose }) {
  const router = useRouter();
  const [form, setForm] = useState({ clientName: '', platforms: '', mobile: '', doer: '' });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.clientName.trim()) { alert('Client name is required'); return; }
    setSaving(true);
    const res = await fetch('/api/fms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ clientName: '', platforms: '', mobile: '', doer: '' });
      onClose();
      router.refresh();
    } else alert('Failed to save');
  }

  return (
    <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">New FMS Entry</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Start tracking a new client campaign</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Client Name *" value={form.clientName} onChange={(v) => update('clientName', v)} />
          <Field label="Platforms"     value={form.platforms}  onChange={(v) => update('platforms', v)} placeholder="Google Ads, Meta Ads" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile Number" value={form.mobile} onChange={(v) => update('mobile', v)} />
            <Field label="Doer Name"     value={form.doer}   onChange={(v) => update('doer', v)} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Create Entry'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input" />
    </div>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const FREQS = [
  { label: 'Daily (365 tasks/year)',          value: 'Daily' },
  { label: 'Weekly (52 tasks/year)',           value: 'Weekly' },
  { label: 'Alternative Week (26 tasks/year)', value: 'Alternative Week' },
  { label: 'Monthly (12 tasks/year)',          value: 'Monthly' },
  { label: 'Quarterly (4 tasks/year)',         value: 'Quarterly' },
  { label: 'Yearly (1 task/year)',             value: 'Yearly' },
];

export default function AddMasterModal({ open, onClose, users = [] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    assignedTo: '',
    frequency: 'Daily',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    task: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function save() {
    if (!form.task.trim()) { alert('Task name is required'); return; }
    if (!form.assignedTo) { alert('Please select an employee'); return; }
    setSaving(true);
    const res = await fetch('/api/masters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: form.task,
        assignedTo: form.assignedTo,
        frequency: form.frequency,
        startDate: form.startDate,
        endDate: form.endDate || null,
        remarks: form.remarks,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ assignedTo: '', frequency: 'Daily', startDate: new Date().toISOString().slice(0, 10), endDate: '', task: '', remarks: '' });
      onClose();
      router.refresh();
      router.push('/masters');
    } else {
      const d = await res.json();
      alert(d.error || 'Something went wrong');
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/></svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">+ Add Checklist Task</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Define a recurring item for the team</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Select Employee */}
          <div>
            <label className="label">Select Employee *</label>
            <select
              value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
              className="input"
            >
              <option value="">Select Employee</option>
              {users.map((u) => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Frequency */}
          <div>
            <label className="label">Frequency</label>
            <select
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              className="input"
            >
              {FREQS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Start & End Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">End Date <span className="text-slate-400">(Optional)</span></label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="input"
              />
            </div>
          </div>

          {/* Task Name */}
          <div>
            <label className="label">Task Name / Description</label>
            <input
              value={form.task}
              onChange={(e) => setForm({ ...form, task: e.target.value })}
              placeholder="Enter task name..."
              className="input"
            />
          </div>

          {/* Remarks */}
          <div>
            <label className="label">Remarks</label>
            <input
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              placeholder="Any remarks..."
              className="input"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Generate Tasks'}</button>
        </div>
      </div>
    </div>
  );
}
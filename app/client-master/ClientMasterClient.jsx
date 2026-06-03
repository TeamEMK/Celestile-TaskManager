'use client';
import { useEffect, useMemo, useState } from 'react';
import { useConfirmToast } from '../components/ConfirmToast';

const blankForm = () => ({
  name: '', contactPerson: '', contactNumber: '', email: '', industry: '', status: 'active', notes: '',
});

export default function ClientMasterClient({ canEdit }) {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // id or null
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const { ask, ConfirmUI } = useConfirmToast();

  async function load() {
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return list.filter((c) =>
      (status === 'All' || c.status === status.toLowerCase()) &&
      (!t || (c.name + c.contactPerson + c.email + c.industry).toLowerCase().includes(t))
    );
  }, [list, q, status]);

  function openAdd() { setEditing(null); setForm(blankForm()); setOpen(true); }
  function openEdit(c) {
    setEditing(c.id);
    setForm({
      name: c.name || '', contactPerson: c.contactPerson || '', contactNumber: c.contactNumber || '',
      email: c.email || '', industry: c.industry || '', status: c.status || 'active', notes: c.notes || '',
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await fetch('/api/clients', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing, ...form }),
        });
      } else {
        await fetch('/api/clients', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      }
      setOpen(false); load();
    } finally { setSaving(false); }
  }

  function remove(id) {
    ask('Delete this client?', async () => {
      await fetch(`/api/clients?id=${id}`, { method: 'DELETE' });
      load();
    });
  }

  return (
    <div className="space-y-4">
<div className="card p-5">
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <input className="input max-w-xs" placeholder="🔍 Search name / contact / email…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>All</option><option>Active</option><option>Inactive</option>
          </select>
          <div className="ml-auto text-[11px] text-slate-500">{filtered.length} of {list.length}</div>
          {canEdit && <button className="btn-primary" onClick={openAdd}>+ Add Client</button>}
        </div>

        {filtered.length === 0 ? (
          <p className="text-center text-[13px] text-slate-400 py-8">No clients yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="table-th">ID</th>
                <th className="table-th">Name</th>
                <th className="table-th">Contact Person</th>
                <th className="table-th">Phone</th>
                <th className="table-th">Email</th>
                <th className="table-th">Industry</th>
                <th className="table-th">Status</th>
                {canEdit && <th className="table-th text-right pr-3">Action</th>}
              </tr></thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="table-row">
                    <td className="table-td text-slate-400 font-mono text-[11px]">{c.id}</td>
                    <td className="table-td font-medium text-slate-800">{c.name}</td>
                    <td className="table-td">{c.contactPerson || '—'}</td>
                    <td className="table-td">{c.contactNumber || '—'}</td>
                    <td className="table-td">{c.email || '—'}</td>
                    <td className="table-td">{c.industry || '—'}</td>
                    <td className="table-td">
                      <span className={`pill ${c.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                        {c.status}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="table-td">
                        <div className="flex gap-1 justify-end">
                          <button className="btn-secondary" onClick={() => openEdit(c)}>Edit</button>
                          <button className="btn-danger" onClick={() => remove(c.id)}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="card p-5 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold mb-4">{editing ? 'Edit Client' : 'Add Client'}</div>
            <div className="space-y-3">
              <div><label className="label">Name *</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Contact Person</label>
                  <input className="input" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
                <div><label className="label">Phone</label>
                  <input className="input" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Email</label>
                  <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><label className="label">Industry</label>
                  <input className="input" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
              </div>
              <div><label className="label">Status</label>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option><option value="inactive">Inactive</option>
                </select></div>
              <div><label className="label">Notes</label>
                <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : (editing ? 'Save' : 'Add')}</button>
            </div>
          </div>
        </div>
      )}
      {ConfirmUI}
    </div>
  );
}

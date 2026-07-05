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
    <div className="space-y-4 animate-fade-in">

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <ClientsIcon className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[15px] font-semibold tracking-tight text-slate-900">Client Master</h1>
            <p className="text-[11.5px] text-slate-500">{filtered.length} of {list.length} client{list.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          <input className="input max-w-xs" placeholder="🔍 Search name / contact / email…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>All</option><option>Active</option><option>Inactive</option>
          </select>
          {canEdit && (
            <button className="btn-primary flex items-center gap-1.5" onClick={openAdd}>
              <PlusIcon /> Add Client
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-3">
              <ClientsIcon className="w-6 h-6 text-slate-400" />
            </div>
            <div className="text-[13.5px] font-semibold text-slate-700">No clients yet</div>
            <div className="text-[12px] text-slate-500 mt-0.5">Add your first client to get started.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                <tr>
                  <th className="table-th">ID</th>
                  <th className="table-th">Name</th>
                  <th className="table-th">Contact Person</th>
                  <th className="table-th">Phone</th>
                  <th className="table-th">Email</th>
                  <th className="table-th">Industry</th>
                  <th className="table-th">Status</th>
                  {canEdit && <th className="table-th text-right pr-3">Action</th>}
                </tr>
              </thead>
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
                        <div className="flex gap-1.5 justify-end">
                          <button className="pill bg-primary-50 text-primary-700 hover:bg-primary-100 cursor-pointer" onClick={() => openEdit(c)}>Edit</button>
                          <button className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer" onClick={() => remove(c.id)}>Delete</button>
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto z-50 pt-10 px-4 pb-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-slate-100 rounded-t-2xl flex items-center gap-2.5 bg-primary-50">
              <div className="w-9 h-9 rounded-lg shrink-0 grid place-items-center text-white shadow-sm bg-gradient-to-br from-primary-400 to-primary-700">
                <ClientsIcon className="w-[17px] h-[17px]" stroke="#fff" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-primary-800">{editing ? 'Edit Client' : 'Add Client'}</div>
                <div className="text-[11px] mt-0.5 text-primary-600">{editing ? 'Update client details' : 'Create a new client record'}</div>
              </div>
              <button onClick={() => setOpen(false)} className="btn-ghost w-8 h-8 !p-0 shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
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
            <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2 rounded-b-2xl bg-slate-50/60">
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

function PlusIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function ClientsIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/></svg>; }

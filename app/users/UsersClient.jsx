'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const ROLES = ['Admin', 'User', 'HOD'];

const ROLE_STYLE = {
  Admin: 'bg-amber-50 text-amber-700 border-amber-200',
  User:  'bg-primary-50 text-primary-700 border-primary-200',
  HOD:   'bg-violet-50 text-violet-700 border-violet-200',
};

const ROLE_ICON = {
  Admin: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7Z"/></svg>,
  HOD:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>,
  User:  (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
};

function normalizeRoles(roles) {
  if (Array.isArray(roles)) return roles;
  if (typeof roles === 'string') return roles.split(',').map(r => r.trim()).filter(Boolean);
  return ['User'];
}

export default function UsersClient({ users = [], departments = [] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const roles   = normalizeRoles(session?.user?.roles);
  const isAdmin = roles.includes('Admin') || roles.includes('HOD');

  const [search,    setSearch]    = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [pwdModal,  setPwdModal]  = useState(false);
  const [pwdUser,   setPwdUser]   = useState(null);

  const filtered = users
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .filter((u) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (u?.name       || '').toLowerCase().includes(s) ||
        (u?.email      || '').toLowerCase().includes(s) ||
        (u?.phone      || '').toLowerCase().includes(s) ||
        (u?.department || '').toLowerCase().includes(s)
      );
    });

  function openAdd()    { setEditing(null); setModalOpen(true); }
  function openEdit(u)  { setEditing({ ...u, roles: normalizeRoles(u?.roles) }); setModalOpen(true); }
  function openSetPassword(u) { if (!u) return; setPwdUser(u); setPwdModal(true); }

  async function deleteUser(id) {
    if (!confirm('Delete this user?')) return;
    await fetch('/api/users?id=' + id, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Top bar: search + Add User */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 w-72 shadow-sm">
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Email, Phone, Department…"
            className="bg-transparent border-none outline-none text-[13px] text-slate-700 placeholder:text-slate-400 w-full"
          />
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="btn-primary flex items-center gap-1.5 shrink-0">
            <PlusIcon /> Add User
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">User</th>
                <th className="table-th">Email</th>
                <th className="table-th">Phone</th>
                <th className="table-th">Department</th>
                <th className="table-th">Roles</th>
                {isAdmin && <th className="table-th">Action</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="table-td text-center text-slate-400 py-10">
                    No users found
                  </td>
                </tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="table-row">
                  <td className="table-td">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u?.name || ''} picture={u?.picture} />
                      <div>
                        <div className="font-medium text-slate-900">{u?.name || 'Unknown'}</div>
                        <div className="text-[11px] text-slate-500">{u?.department || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-td text-slate-600">{u?.email || '—'}</td>
                  <td className="table-td text-slate-600">{u?.phone || '—'}</td>
                  <td className="table-td text-slate-600">{u?.department || '—'}</td>
                  <td className="table-td">
                    <div className="flex flex-wrap gap-1">
                      {normalizeRoles(u?.roles).map((r) => {
                        const Icon = ROLE_ICON[r];
                        return (
                          <span key={r} className={`pill border ${ROLE_STYLE[r] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            {Icon && <Icon className="w-3 h-3" />}
                            {r}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="table-td">
                      <div className="flex gap-1.5 flex-wrap">
                        <button onClick={() => openEdit(u)}          className="pill bg-primary-50 text-primary-700 hover:bg-primary-100 cursor-pointer">Edit</button>
                        <button onClick={() => openSetPassword(u)}   className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">Set Password</button>
                        <button onClick={() => deleteUser(u.id)}     className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer">Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        user={editing}
        departments={departments}
        onSaved={() => router.refresh()}
      />
      <SetPasswordModal
        open={pwdModal}
        onClose={() => setPwdModal(false)}
        user={pwdUser}
      />
    </div>
  );
}

function UserModal({ open, onClose, user, departments, onSaved }) {
  const fileRef    = useRef(null);
  const [form,           setForm]          = useState({});
  const [picture,        setPicture]       = useState(null);
  const [pictureChanged, setPictureChanged]= useState(false);
  const [saving,         setSaving]        = useState(false);
  const [bulkFile,       setBulkFile]      = useState(null);
  const [bulkSaving,     setBulkSaving]    = useState(false);
  const [bulkMsg,        setBulkMsg]       = useState('');

  function parseUserCSV(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const hasHeader = header.includes('email') || header.includes('name');
    const cols = hasHeader ? header : ['name','email','password','role','user_role','phone','department'];
    const start = hasHeader ? 1 : 0;
    return lines.slice(start).map(line => {
      const parts = line.split(',');
      const row = {};
      cols.forEach((c, i) => { row[c] = (parts[i] || '').trim(); });
      return row;
    });
  }

  async function uploadBulkUsers() {
    if (!bulkFile) return;
    setBulkSaving(true); setBulkMsg('');
    try {
      const rows = parseUserCSV(await bulkFile.text());
      if (!rows.length) { setBulkMsg('No valid rows found.'); setBulkSaving(false); return; }
      const res = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: rows }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setBulkMsg(`✅ ${d.inserted} added${d.errors?.length ? ` · ${d.errors.length} skipped` : ''}`);
      setBulkFile(null);
      onSaved();
    } catch (e) {
      setBulkMsg('❌ ' + e.message);
    } finally { setBulkSaving(false); }
  }

  function downloadUserSample() {
    const csv = 'name,email,password,role,user_role,phone,department\n' +
      'John Doe,john@test.com,pass123,user,user,9876543210,Sales\n' +
      'Jane Smith,jane@test.com,pass123,hod,hod,9876543211,Production\n' +
      'IT Admin,it@test.com,pass123,admin,user,9876543212,IT\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'users-sample.csv';
    a.click();
  }

  useEffect(() => {
    if (open) {
      if (user) {
        setForm({ id: user.id, name: user.name || '', email: user.email || '', phone: user.phone || '', department: user.department || '', roles: normalizeRoles(user.roles), active: user.active !== false, notifEmail: user.notifEmail || '' });
        setPicture(user.picture || null);
      } else {
        setForm({ name: '', email: '', phone: '', department: '', roles: ['User'], password: '', notifEmail: '' });
        setPicture(null);
      }
      setPictureChanged(false);
    }
  }, [user, open, departments]);

  if (!open) return null;

  function toggleRole(r) {
    const cur = normalizeRoles(form.roles);
    setForm({ ...form, roles: cur.includes(r) ? cur.filter(x => x !== r) : [...cur, r] });
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      setPicture(canvas.toDataURL('image/jpeg', 0.75));
      setPictureChanged(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
    e.target.value = '';
  }

  function removePicture() {
    setPicture(null);
    setPictureChanged(true);
  }

  async function save() {
    if (!form.name?.trim() || !form.email?.trim()) {
      alert('Name and email are required.');
      return;
    }
    setSaving(true);
    const payload = { ...form };
    if (pictureChanged) payload.picture = picture;
    try {
      const res = await fetch('/api/users', {
        method: user ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert('Failed to save: ' + (d.error || res.statusText));
        setSaving(false);
        return;
      }
    } catch (e) {
      alert('Network error: ' + e.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
    onSaved();
  }

  const initials = (form.name || 'U').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'U';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[440px] overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <svg className="w-4.5 h-4.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-slate-900">{user ? 'Edit User' : 'Add User'}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{user ? 'Update member details' : 'Create a new team member'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3 overflow-y-auto max-h-[calc(90vh-160px)]">

          {/* Photo picker */}
          <div className="flex items-center gap-4 pb-1">
            <div className="shrink-0">
              {picture ? (
                <img src={picture} alt="" className="w-14 h-14 rounded-xl object-cover ring-2 ring-slate-100 shadow-sm" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 grid place-items-center text-white text-base font-bold ring-2 ring-slate-100 shadow-sm">
                  {initials}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary !py-1.5 !px-3 text-xs">
                Upload Photo
              </button>
              {picture && (
                <button type="button" onClick={removePicture} className="text-xs text-red-500 hover:text-red-700 transition">
                  Remove
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
          </div>

          {/* Row 1: Name + Email */}
          <div className="grid grid-cols-2 gap-3">
            <UField label="Full Name" placeholder="Enter full name" value={form.name || ''} onChange={v => setForm({ ...form, name: v })} />
            <UField label="Email" sublabel="Login" placeholder="Enter login email" type="email" value={form.email || ''} onChange={v => setForm({ ...form, email: v })} />
          </div>

          {/* Row 2: Notification Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <UField label="Notification Email" sublabel="Real Gmail for task notifications" placeholder="real email for notifications" value={form.notifEmail || ''} onChange={v => setForm({ ...form, notifEmail: v })} />
            <UField label="Phone Number" placeholder="Enter phone number" value={form.phone || ''} onChange={v => setForm({ ...form, phone: v })} />
          </div>

          {/* Row 3: Department */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Department</label>
              <div className="relative">
                <select
                  value={form.department || ''}
                  onChange={e => setForm({ ...form, department: e.target.value })}
                  className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition"
                >
                  <option value="">e.g. Sales, Production</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>

            {/* Password — add mode only */}
            {!user && (
              <UField label="Password" placeholder="Enter password" type="password" value={form.password || ''} onChange={v => setForm({ ...form, password: v })} />
            )}
          </div>

          {/* Roles */}
          <div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Roles</div>
            <div className="flex gap-2">
              {ROLES.map(r => {
                const active = normalizeRoles(form.roles).includes(r);
                return (
                  <button key={r} type="button" onClick={() => toggleRole(r)}
                    className={`flex-1 py-2 text-xs rounded-xl border font-medium transition ${active ? ROLE_STYLE[r] : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'}`}>
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bulk upload — add mode only */}
          {!user && (
            <div className="rounded-xl border border-dashed border-slate-200 p-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Bulk Add Users (CSV)</div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="file" accept=".csv,text/csv"
                  onChange={(e) => { setBulkFile(e.target.files?.[0] || null); setBulkMsg(''); }}
                  className="text-[12px] file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
                <button className="btn-success !py-1.5 text-xs" disabled={bulkSaving || !bulkFile} onClick={uploadBulkUsers}>
                  {bulkSaving ? '⏳ Uploading…' : '⬆ Upload CSV'}
                </button>
                <button className="btn-secondary !py-1.5 text-xs" onClick={downloadUserSample}>⬇ Sample</button>
              </div>
              {bulkMsg && <div className="text-[12px] mt-2 text-slate-600">{bulkMsg}</div>}
              <div className="text-[10px] text-slate-400 mt-1.5">
                Format: name, email, password, role, user_role, phone, department
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function SetPasswordModal({ open, onClose, user }) {
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [showConf,  setShowConf]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => { if (open) { setPassword(''); setConfirm(''); setError(''); setShowPass(false); setShowConf(false); } }, [open]);

  if (!open) return null;

  const mismatch = confirm.length > 0 && password !== confirm;

  async function save() {
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    const res = await fetch('/api/users/set-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, password }) });
    setSaving(false);
    if (res.ok) { onClose(); }
    else { const d = await res.json(); setError(d.error || 'Something went wrong'); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">Set Password</h2>
        <p className="text-sm text-slate-500 mb-4">{user?.name}</p>
        <div className="space-y-4">
          {/* New Password */}
          <div>
            <label className="label">New Password</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                className="input pr-10" placeholder="Min. 6 characters" />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <EyeIcon open={showPass} />
              </button>
            </div>
          </div>
          {/* Confirm Password */}
          <div>
            <label className="label">Confirm Password</label>
            <div className="relative">
              <input type={showConf ? 'text' : 'password'} value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className={`input pr-10 ${mismatch ? 'border-red-400 bg-red-50' : ''}`}
                placeholder="Re-enter password" />
              <button type="button" onClick={() => setShowConf(!showConf)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <EyeIcon open={showConf} />
              </button>
            </div>
            {mismatch && <p className="text-red-500 text-xs mt-1">Passwords do not match</p>}
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving || mismatch} className="btn-primary">{saving ? 'Saving...' : 'Set Password'}</button>
        </div>
      </div>
    </div>
  );
}

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function UField({ label, sublabel, placeholder, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
        {sublabel && <span className="normal-case font-normal text-slate-400 ml-1">({sublabel})</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition"
      />
    </div>
  );
}

function Avatar({ name = '', picture }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
  if (picture) {
    return (
      <img src={picture} alt={name} className="w-9 h-9 rounded-full object-cover" />
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white grid place-items-center text-[11px] font-bold">
      {ini || 'U'}
    </div>
  );
}

function PlusIcon()   { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }

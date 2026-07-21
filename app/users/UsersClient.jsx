'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useConfirmToast } from '../components/ConfirmToast';

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

const DEPARTMENTS = [
  { value: 'Process Coordinator',         label: 'Process Coordinator'         },
  { value: 'Sales Person',                label: 'Sales Person'                },
  { value: 'Client Relationship Manager', label: 'Client Relationship Manager' },
  { value: 'Executive Assistant',         label: 'Executive Assistant'         },
  { value: 'Accounts',                    label: 'Accounts'                    },
  { value: 'Business Coordinator',        label: 'Business Coordinator'        },
  { value: 'HOD Production',              label: 'HOD Production'              },
  { value: 'SC',                          label: 'SC'                          },
  { value: 'HR',                          label: 'HR'                          },
  { value: 'Runner',                      label: 'Runner'                      },
  { value: 'Dispatch',                    label: 'Dispatch'                    },
  { value: 'Designer',                    label: 'Designer'                    },
  { value: 'Management',                  label: 'Management'                  },
];

// Maps old stored values (lowercase/shorthand) → full display label
const DEPT_DISPLAY = {
  'pc':                   'Process Coordinator',
  'sales':                'Sales Person',
  'crm':                  'Client Relationship Manager',
  'ea':                   'Executive Assistant',
  'accounts':             'Accounts',
  'Business coordinator': 'Business Coordinator',
  'HOD production':       'HOD Production',
  'SC':                   'SC',
  'HR':                   'HR',
  'runner':               'Runner',
  'Dispatch':             'Dispatch',
  'designer':             'Designer',
  'management':           'Management',
};

function deptLabel(dept) {
  if (!dept) return '—';
  return DEPT_DISPLAY[dept] || dept;
}

const BRANCH_STYLE = {
  hyderabad: { label: 'Hyderabad', cls: 'bg-violet-50 text-violet-700' },
  factory:   { label: 'Factory',   cls: 'bg-amber-50 text-amber-700' },
  bangalore: { label: 'Bangalore', cls: 'bg-emerald-50 text-emerald-700' },
};
function branchInfo(branch) {
  return BRANCH_STYLE[branch] || BRANCH_STYLE.bangalore;
}

export default function UsersClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const roles   = normalizeRoles(session?.user?.roles);
  const isAdmin = roles.includes('Admin') || roles.includes('HOD');
  const { ask, ConfirmUI } = useConfirmToast();

  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [pwdModal,  setPwdModal]  = useState(false);
  const [pwdUser,   setPwdUser]   = useState(null);
  const [customDepartments, setCustomDepartments] = useState([]);

  const departments = useMemo(() => [
    ...DEPARTMENTS,
    ...customDepartments
      .filter((name) => !DEPARTMENTS.some((d) => d.value.toLowerCase() === name.toLowerCase()))
      .map((name) => ({ value: name, label: name })),
  ], [customDepartments]);

  function addDepartment(name) {
    setCustomDepartments((cur) => (cur.some((d) => d.toLowerCase() === name.toLowerCase()) ? cur : [...cur, name]));
  }

  useEffect(() => {
    fetch('/api/departments')
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setCustomDepartments(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  function reloadUsers() {
    fetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  function deleteUser(id) {
    ask('Delete this user?', async () => {
      await fetch('/api/users?id=' + id, { method: 'DELETE' });
      reloadUsers();
    });
  }

  if (loading) return (
    <div className="flex items-center justify-center gap-2.5 py-16">
      <div className="w-5 h-5 rounded-full border-2 border-primary-300 border-t-primary-600 animate-spin" />
      <span className="text-[13px] text-slate-500">Loading users…</span>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Top bar: title + search + count + Add User */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <UsersIcon className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[15px] font-semibold tracking-tight text-slate-900">Team Members</h1>
            <p className="text-[11.5px] text-slate-500">{filtered.length} user{filtered.length !== 1 ? 's' : ''} · roles &amp; access</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 w-full sm:w-64 shadow-sm transition-all duration-200 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 sm:ml-auto">
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Email, Phone, Department…"
            autoComplete="off"
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
        <div className="overflow-auto max-h-[calc(100vh-190px)]">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
              <tr>
                <th className="table-th">User</th>
                <th className="table-th">Email</th>
                <th className="table-th">Phone</th>
                <th className="table-th">Department</th>
                <th className="table-th">Branch</th>
                <th className="table-th">Roles</th>
                {isAdmin && <th className="table-th">Action</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="py-14 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-3">
                      <UsersIcon className="w-6 h-6 text-slate-400" />
                    </div>
                    <div className="text-[13.5px] font-semibold text-slate-700">No users found</div>
                    <div className="text-[12px] text-slate-500 mt-0.5">Try adjusting your search terms.</div>
                  </td>
                </tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="table-row">
                  <td className="table-td">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u?.name || ''} picture={u?.picture} />
                      <div>
                        <div className="font-medium text-slate-900">{u?.name || 'Unknown'}</div>
                        <div className="text-[11px] text-slate-500">{deptLabel(u?.department)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-td text-slate-600">{u?.email || '—'}</td>
                  <td className="table-td text-slate-600">{u?.phone || '—'}</td>
                  <td className="table-td text-slate-600">{deptLabel(u?.department)}</td>
                  <td className="table-td">
                    {u?.branch ? (
                      <span className={`pill ${branchInfo(u.branch).cls}`}>
                        {branchInfo(u.branch).label}
                      </span>
                    ) : '—'}
                  </td>
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
        onAddDepartment={addDepartment}
        defaultBranch={session?.user?.branch || ''}
        onSaved={() => { setModalOpen(false); reloadUsers(); }}
      />
      {ConfirmUI}
      <SetPasswordModal
        open={pwdModal}
        onClose={() => setPwdModal(false)}
        user={pwdUser}
      />
    </div>
  );
}

const ADD_DEPT_VALUE = '__add_new_department__';

function UserModal({ open, onClose, user, departments, onAddDepartment, defaultBranch, onSaved }) {
  const fileRef    = useRef(null);
  const [form,           setForm]          = useState({});
  const [picture,        setPicture]       = useState(null);
  const [addingDept,     setAddingDept]    = useState(false);
  const [newDeptName,    setNewDeptName]   = useState('');
  const [savingDept,     setSavingDept]    = useState(false);
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
        setForm({ id: user.id, name: user.name || '', email: user.email || '', phone: user.phone || '', department: user.department || '', branch: user.branch || '', roles: normalizeRoles(user.roles), active: user.active !== false, notifEmail: user.notifEmail || '' });
        setPicture(user.picture || null);
      } else {
        setForm({ name: '', email: '', phone: '', department: '', branch: defaultBranch, roles: ['User'], password: '', notifEmail: '' });
        setPicture(null);
      }
      setPictureChanged(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, open]);

  if (!open) return null;

  function toggleRole(r) {
    const cur = normalizeRoles(form.roles);
    setForm({ ...form, roles: cur.includes(r) ? cur.filter(x => x !== r) : [...cur, r] });
  }

  function handleDeptSelect(v) {
    if (v === ADD_DEPT_VALUE) { setAddingDept(true); setNewDeptName(''); return; }
    setForm({ ...form, department: v });
  }

  async function saveNewDepartment() {
    const name = newDeptName.trim();
    if (!name) { setAddingDept(false); return; }
    setSavingDept(true);
    try {
      await fetch('/api/departments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      onAddDepartment(name);
      setForm((f) => ({ ...f, department: name }));
      setAddingDept(false);
    } finally { setSavingDept(false); }
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
    if (!form.name?.trim())       { alert('Full Name is required.');   return; }
    if (!form.email?.trim())      { alert('Email is required.');       return; }
    if (!form.phone?.trim())      { alert('Phone Number is required.'); return; }
    if (!form.department?.trim()) { alert('Department is required.');  return; }
    if (!user && !form.password?.trim()) { alert('Password is required.'); return; }
    if (!form.roles?.length)      { alert('Please select at least one role.'); return; }

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

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={onClose}>
      <style>{`
        .um-scroll::-webkit-scrollbar{width:4px}
        .um-scroll::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:99px}
        .um-scroll::-webkit-scrollbar-track{background:transparent}
      `}</style>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={`px-5 py-3.5 border-b border-slate-100 rounded-t-2xl flex items-center gap-2.5 shrink-0 ${user ? 'bg-emerald-50' : 'bg-primary-50'}`}>
          <div className={`w-9 h-9 rounded-lg shrink-0 grid place-items-center text-white shadow-sm bg-gradient-to-br ${user ? 'from-emerald-500 to-emerald-700' : 'from-primary-400 to-primary-700'}`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[14px] font-bold ${user ? 'text-emerald-800' : 'text-primary-800'}`}>{user ? 'Edit User' : 'Add User'}</div>
            <div className={`text-[11px] mt-0.5 ${user ? 'text-emerald-600' : 'text-primary-600'}`}>{user ? 'Update member details' : 'Create a new team member'}</div>
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 !p-0 shrink-0">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="um-scroll px-5 py-4 flex flex-col gap-3 overflow-y-auto flex-1">

          {/* Photo picker */}
          <div className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
            <div className="shrink-0">
              {picture ? (
                <img src={picture} alt="" className="w-12 h-12 rounded-lg object-cover shadow-sm" />
              ) : (
                <div className={`w-12 h-12 rounded-lg grid place-items-center text-white text-base font-bold shadow-sm bg-gradient-to-br ${user ? 'from-emerald-500 to-emerald-700' : 'from-primary-400 to-primary-700'}`}>
                  {initials}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary !px-3 !py-1.5 !text-[12px]">
                Upload Photo
              </button>
              {picture && (
                <button type="button" onClick={removePicture} className="text-[12px] font-medium text-red-500 hover:text-red-600">Remove</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
          </div>

          {/* Name + Email */}
          <div className="grid grid-cols-2 gap-2.5">
            <UFieldC label="Full Name" placeholder="Enter full name" value={form.name||''} onChange={v=>setForm({...form,name:v})} autoComplete="off" />
            <UFieldC label="Email (Login)" placeholder="Enter login email" type="email" value={form.email||''} onChange={v=>setForm({...form,email:v})} autoComplete="off" />
          </div>

          {/* Notification Email + Phone */}
          <div className="grid grid-cols-2 gap-2.5">
            <UFieldC label="Notification Email" sublabel="Real Gmail for notifications" placeholder="notification email" value={form.notifEmail||''} onChange={v=>setForm({...form,notifEmail:v})} autoComplete="off" />
            <UFieldC label="Phone Number" placeholder="Enter phone number" value={form.phone||''} onChange={v=>setForm({...form,phone:v})} autoComplete="off" />
          </div>

          {/* Department + Branch */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="label">Department</label>
              {addingDept ? (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    className="input flex-1"
                    placeholder="New department name"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveNewDepartment(); } if (e.key === 'Escape') setAddingDept(false); }}
                  />
                  <button type="button" onClick={saveNewDepartment} disabled={savingDept || !newDeptName.trim()} className="btn-success !px-3 !text-[12px]">
                    {savingDept ? '…' : 'Add'}
                  </button>
                  <button type="button" onClick={() => setAddingDept(false)} className="btn-ghost !px-2">✕</button>
                </div>
              ) : (
                <select value={form.department||''} onChange={e=>handleDeptSelect(e.target.value)} className="input">
                  <option value="">Select department</option>
                  {departments.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
                  <option value={ADD_DEPT_VALUE}>+ Add New Department…</option>
                </select>
              )}
            </div>
            <div>
              <label className="label">Branch</label>
              <select value={form.branch||''} onChange={e=>setForm({...form,branch:e.target.value})} className="input">
                <option value="">Select branch</option>
                <option value="bangalore">Bangalore</option>
                <option value="hyderabad">Hyderabad</option>
                <option value="factory">Factory</option>
              </select>
            </div>
          </div>

          {/* Password (new user only) */}
          {!user && (
            <div>
              <UFieldC label="Password" placeholder="Enter password" type="password" value={form.password||''} onChange={v=>setForm({...form,password:v})} />
            </div>
          )}

          {/* Roles */}
          <div>
            <label className="label">Roles</label>
            <div className="flex gap-2">
              {ROLES.map(r => {
                const active = normalizeRoles(form.roles).includes(r);
                const activeCls = {
                  Admin: 'bg-amber-100 text-amber-700 border-amber-300 shadow-[0_0_0_3px_rgba(245,158,11,0.15)]',
                  User:  'bg-primary-100 text-primary-700 border-primary-300 shadow-[0_0_0_3px_rgba(185,111,61,0.15)]',
                  HOD:   'bg-violet-100 text-violet-700 border-violet-300 shadow-[0_0_0_3px_rgba(124,58,237,0.15)]',
                }[r] || 'bg-slate-100 text-slate-700 border-slate-300';
                return (
                  <button key={r} type="button" onClick={()=>toggleRole(r)}
                    className={`flex-1 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-all duration-150 cursor-pointer ${active ? activeCls : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-500'}`}>
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bulk upload — add mode only */}
          {!user && (
            <div className="rounded-lg border border-dashed border-slate-200 p-3">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Bulk Add Users (CSV)</div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="file" accept=".csv,text/csv" onChange={(e)=>{setBulkFile(e.target.files?.[0]||null);setBulkMsg('');}}
                  className="text-[12px] file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1 file:text-[11px] file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
                <button className="btn-success !px-3 !py-1 !text-[11.5px]"
                  disabled={bulkSaving||!bulkFile} onClick={uploadBulkUsers}>
                  {bulkSaving?'⏳ Uploading…':'⬆ Upload CSV'}
                </button>
                <button className="btn-secondary !px-3 !py-1 !text-[11.5px]"
                  onClick={downloadUserSample}>⬇ Sample</button>
              </div>
              {bulkMsg && <div className={`text-[12px] mt-1.5 font-medium ${bulkMsg.startsWith('✅') ? 'text-emerald-600' : 'text-red-600'}`}>{bulkMsg}</div>}
              <div className="text-[10px] text-slate-400 mt-1.5">Format: name, email, password, role, user_role, phone, department</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2 rounded-b-2xl bg-slate-50/60 shrink-0">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className={user ? 'btn-success' : 'btn-primary'}>
            {saving?'Saving…':'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
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

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-primary-50 text-primary-600">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Set Password</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{user?.name}</p>
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 !p-0 shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
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
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving || mismatch} className="btn-primary">{saving ? 'Saving...' : 'Set Password'}</button>
        </div>
      </div>
    </div>,
    document.body
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

function UField({ label, sublabel, placeholder, value, onChange, type = 'text', autoComplete }) {
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
        autoComplete={autoComplete || (type === 'password' ? 'new-password' : 'off')}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition"
      />
    </div>
  );
}

function UFieldC({ label, sublabel, placeholder, value, onChange, type = 'text', autoComplete }) {
  return (
    <div>
      <label className="label">
        {label}
        {sublabel && <span className="normal-case font-normal text-slate-400 ml-1">({sublabel})</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete || (type === 'password' ? 'new-password' : 'off')}
        className="input"
      />
    </div>
  );
}

const AVATAR_PALETTE = ['from-rose-400 to-pink-600','from-amber-400 to-orange-600','from-emerald-400 to-teal-600','from-primary-400 to-primary-600','from-violet-400 to-purple-600'];

function Avatar({ name = '', picture }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
  if (picture) {
    return (
      <img src={picture} alt={name} className="w-9 h-9 rounded-full object-cover shadow-sm shrink-0" />
    );
  }
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const grad = AVATAR_PALETTE[hash % AVATAR_PALETTE.length] || AVATAR_PALETTE[0];
  return (
    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${grad} text-white grid place-items-center text-[11px] font-bold shadow-sm shrink-0`}>
      {ini || 'U'}
    </div>
  );
}

function PlusIcon()  { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function UsersIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CsvImport from '../components/CsvImport';

const ROLES = ['Admin', 'User', 'HOD'];
const ROLE_STYLE = {
  Admin: 'bg-amber-50  text-amber-700  border-amber-200',
  User:  'bg-primary-50 text-primary-700 border-primary-200',
  HOD:   'bg-violet-50 text-violet-700 border-violet-200',
};
const ROLE_ICON = {
  Admin: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7Z"/></svg>,
  HOD:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>,
  User:  (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
};

export default function UsersClient({ users, departments }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pwdModal, setPwdModal] = useState(false);   // ← add karo
  const [pwdUser, setPwdUser] = useState(null);       // ← add karo

  function openSetPassword(u) {                       // ← add karo
    setPwdUser(u);
    setPwdModal(true);
  }

  const filtered = users.filter((u) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      (u.department || '').toLowerCase().includes(s) ||
      (u.roles || []).some((r) => r.toLowerCase().includes(s))
    );
  });

  function openAdd()  { setEditing(null); setModalOpen(true); }
  function openEdit(u){ setEditing(u);    setModalOpen(true); }

  async function deleteUser(id) {
    if (!confirm('Delete this user?')) return;
    await fetch('/api/users?id=' + id, { method: 'DELETE' });
    router.refresh();
  }

  const stats = users.reduce((acc, u) => {
    (u.roles || []).forEach((r) => { acc[r] = (acc[r] || 0) + 1; });
    return acc;
  }, {});

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-sub">Manage team members, roles, and department assignments</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CsvImport
            templateName="users_template.csv"
            columns={['name', 'email', 'phone', 'department', 'roles']}
            sampleRow={['Tushar Singh', 'tushar@example.com', '9876543210', departments[0] || 'Operations', 'User;Admin']}
            parseRow={(r) => {
              if (!r.name || !r.email) return null;
              const roles = (r.roles || 'User').split(/[;|,]/).map((x) => x.trim()).filter(Boolean);
              return {
                name: r.name,
                email: r.email,
                phone: r.phone || '',
                department: r.department || (departments[0] || ''),
                roles: roles.length ? roles : ['User'],
              };
            }}
            endpoint="/api/users"
            onDone={() => router.refresh()}
          />
          <button onClick={openAdd} className="btn-primary">
            <PlusIcon /> Add User
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Total Users"  value={users.length}      tone="primary" />
        <KPI label="Admins"       value={stats.Admin || 0}  tone="amber" />
        <KPI label="HODs"         value={stats.HOD || 0}    tone="violet" />
        <KPI label="Departments"  value={departments.length} tone="emerald" />
      </div>

      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, dept, role…" className="input pl-9 w-80" />
        </div>
        <div className="flex-1" />
        <div className="text-xs text-slate-500">{filtered.length} of {users.length} users</div>
      </div>

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
                <th className="table-th w-32">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="table-row">
                  <td className="table-td">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} />
                      <div>
                        <div className="font-medium text-slate-900">{u.name}</div>
                        <div className="text-[11px] text-slate-500">{u.department || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-td text-slate-600">{u.email}</td>
                  <td className="table-td text-slate-600">{u.phone || '—'}</td>
                  <td className="table-td text-slate-600">{u.department || '—'}</td>
                  <td className="table-td">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles || []).map((r) => {
                        const Icon = ROLE_ICON[r];
                        return (
                          <span key={r} className={`pill border ${ROLE_STYLE[r] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            {Icon && <Icon className="w-3 h-3" />} {r}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="table-td">
                    <div className="flex gap-1.5">
                      <button onClick={() => openEdit(u)}   className="pill bg-primary-50 text-primary-700 hover:bg-primary-100 cursor-pointer">Edit</button>
                      <button onClick={() => openSetPassword(u)} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">Set Password</button>
                      <button onClick={() => deleteUser(u.id)} className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UserModal open={modalOpen} onClose={() => setModalOpen(false)} user={editing} departments={departments} />
    </div>
  );
}

function UserModal({ open, onClose, user, departments }) {
  const router = useRouter();
  const [form, setForm] = useState(
    user || { name: '', email: '', phone: '', department: departments[0], roles: ['User'] }
  );
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  function toggleRole(r) {
    const roles = form.roles.includes(r) ? form.roles.filter((x) => x !== r) : [...form.roles, r];
    setForm({ ...form, roles });
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) {
      alert('Name and email are required');
      return;
    }
    setSaving(true);
    const method = user ? 'PATCH' : 'POST';
    const res = await fetch('/api/users', {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) { onClose(); router.refresh(); }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{user ? 'Edit User' : 'Add User'}</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">{user ? 'Update details and roles' : 'Create a new team member'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Full Name *" value={form.name}  onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Email *"     value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Field label="Phone"       value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <div>
            <label className="label">Department</label>
            <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="input">
              {departments.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Roles</label>
            <div className="flex gap-2 flex-wrap">
              {ROLES.map((r) => {
                const active = form.roles.includes(r);
                return (
                  <button key={r} onClick={() => toggleRole(r)} className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition ${active ? ROLE_STYLE[r] : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

const KPI_TONES = {
  primary: { ring: 'ring-primary-100', text: 'text-primary-700', bg: 'bg-primary-50' },
  amber:   { ring: 'ring-amber-100',   text: 'text-amber-700',   bg: 'bg-amber-50' },
  emerald: { ring: 'ring-emerald-100', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  violet:  { ring: 'ring-violet-100',  text: 'text-violet-700',  bg: 'bg-violet-50' },
};
function KPI({ label, value, tone }) {
  const t = KPI_TONES[tone];
  return (
    <div className="card p-4 flex items-center justify-between">
      <div>
        <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1">{value}</div>
      </div>
      <div className={`w-10 h-10 rounded-xl ${t.bg} ${t.text} grid place-items-center`}>
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input" />
    </div>
  );
}

function Avatar({ name = '' }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '·';
  const palette = ['from-rose-400 to-pink-600','from-amber-400 to-orange-600','from-emerald-400 to-teal-600','from-primary-400 to-primary-600','from-violet-400 to-purple-600'];
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const grad = palette[hash % palette.length];
  return <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${grad} text-white grid place-items-center text-[11px] font-bold shrink-0`}>{ini}</div>;
}

<SetPasswordModal 
  open={pwdModal} 
  onClose={() => setPwdModal(false)} 
  user={pwdUser} 
/>
function PlusIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }

function SetPasswordModal({ open, onClose, user }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function save() {
    setError('');
    if (password.length < 6) {
      setError('Password kam se kam 6 characters ka hona chahiye');
      return;
    }
    if (password !== confirm) {
      setError('Passwords match nahi kar rahe!');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/users/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, password }),
    });
    setSaving(false);
    if (res.ok) {
      setDone(true);
      setPassword('');
      setConfirm('');
      setTimeout(() => { setDone(false); onClose(); }, 1500);
    } else {
      const d = await res.json();
      setError(d.error || 'Something went wrong');
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Set Password</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">{user?.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {done ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 grid place-items-center mx-auto mb-2">
                <svg className="w-6 h-6 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
              </div>
              <p className="text-emerald-600 font-medium">Password set ho gaya! ✅</p>
            </div>
          ) : (
            <>
              <Field label="New Password" value={password} onChange={setPassword} type="password" placeholder="Min 6 characters" />
              <Field label="Confirm Password" value={confirm} onChange={setConfirm} type="password" placeholder="Dobara likho" />
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </>
          )}
        </div>
        {!done && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'Setting...' : 'Set Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
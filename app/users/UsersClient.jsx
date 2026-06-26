'use client';

import { useState, useEffect, useRef } from 'react';
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
  'pc', 'sales', 'crm', 'ea', 'accounts',
  'Business coordinator', 'HOD production',
  'SC', 'HR', 'runner', 'Dispatch', 'designer',
];

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
  const departments = DEPARTMENTS;

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

  if (loading) return <div className="text-[13px] text-slate-400 py-8 text-center">Loading users…</div>;

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

  const headerGrad = user
    ? 'linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)'
    : 'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)';
  const iconGrad = user
    ? 'linear-gradient(135deg,#059669,#047857)'
    : 'linear-gradient(135deg,#7c3aed,#4f46e5)';
  const iconShadow = user
    ? '0 4px 12px rgba(5,150,105,0.35)'
    : '0 4px 12px rgba(124,58,237,0.35)';
  const titleColor  = user ? '#065f46' : '#3730a3';
  const subtitleColor = user ? '#059669' : '#6d28d9';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,0.45)', backdropFilter:'blur(6px)' }} onClick={onClose}>
      <style>{`
        .um-scroll::-webkit-scrollbar{width:4px}
        .um-scroll::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:99px}
        .um-scroll::-webkit-scrollbar-track{background:transparent}
        .um-inp{width:100%;box-sizing:border-box;padding:6px 10px;font-size:12.5px;color:#1e293b;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;outline:none;transition:border-color .15s,box-shadow .15s;font-family:inherit}
        .um-inp:focus{border-color:#818cf8;box-shadow:0 0 0 3px rgba(129,140,248,0.15)}
        .um-lbl{display:block;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px}
      `}</style>
      <div style={{ background:'#fff', borderRadius:20, width:'100%', maxWidth:460, maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:'14px 18px 12px', borderBottom:'1px solid #f1f5f9', background:headerGrad, borderRadius:'20px 20px 0 0', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, flexShrink:0, background:iconGrad, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:iconShadow }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:titleColor }}>{user ? 'Edit User' : 'Add User'}</div>
            <div style={{ fontSize:11, color:subtitleColor, marginTop:1 }}>{user ? 'Update member details' : 'Create a new team member'}</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:8, border:'none', background:'rgba(0,0,0,0.06)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="um-scroll" style={{ padding:'14px 18px', overflowY:'auto', display:'flex', flexDirection:'column', gap:10 }}>

          {/* Photo picker */}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 10px', background:'#f8fafc', borderRadius:10, border:'1px solid #f1f5f9' }}>
            <div style={{ flexShrink:0 }}>
              {picture ? (
                <img src={picture} alt="" style={{ width:48, height:48, borderRadius:10, objectFit:'cover', boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }} />
              ) : (
                <div style={{ width:48, height:48, borderRadius:10, background:iconGrad, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:16, fontWeight:700, boxShadow:'0 2px 8px rgba(0,0,0,0.12)' }}>
                  {initials}
                </div>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button type="button" onClick={() => fileRef.current?.click()} style={{ padding:'5px 12px', fontSize:12, fontWeight:600, borderRadius:8, border:'1.5px solid #e2e8f0', background:'#fff', cursor:'pointer', color:'#475569' }}>
                Upload Photo
              </button>
              {picture && (
                <button type="button" onClick={removePicture} style={{ fontSize:12, color:'#ef4444', background:'none', border:'none', cursor:'pointer', padding:0 }}>Remove</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFileChange} />
            </div>
          </div>

          {/* Name + Email */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <UFieldC label="Full Name" placeholder="Enter full name" value={form.name||''} onChange={v=>setForm({...form,name:v})} autoComplete="off" />
            <UFieldC label="Email (Login)" placeholder="Enter login email" type="email" value={form.email||''} onChange={v=>setForm({...form,email:v})} autoComplete="off" />
          </div>

          {/* Notification Email + Phone */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <UFieldC label="Notification Email" sublabel="Real Gmail for notifications" placeholder="notification email" value={form.notifEmail||''} onChange={v=>setForm({...form,notifEmail:v})} autoComplete="off" />
            <UFieldC label="Phone Number" placeholder="Enter phone number" value={form.phone||''} onChange={v=>setForm({...form,phone:v})} autoComplete="off" />
          </div>

          {/* Department + Password */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label className="um-lbl">Department</label>
              <div style={{ position:'relative' }}>
                <select value={form.department||''} onChange={e=>setForm({...form,department:e.target.value})} className="um-inp" style={{ appearance:'none', paddingRight:28, cursor:'pointer',
                  backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                  backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' }}>
                  <option value="">Select department</option>
                  {departments.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            {!user && (
              <UFieldC label="Password" placeholder="Enter password" type="password" value={form.password||''} onChange={v=>setForm({...form,password:v})} />
            )}
          </div>

          {/* Roles */}
          <div>
            <label className="um-lbl">Roles</label>
            <div style={{ display:'flex', gap:8 }}>
              {ROLES.map(r => {
                const active = normalizeRoles(form.roles).includes(r);
                const styles = {
                  Admin: { bg:'#fffbeb', text:'#b45309', border:'#fcd34d', activeBg:'#fef3c7' },
                  User:  { bg:'#eff6ff', text:'#1d4ed8', border:'#93c5fd', activeBg:'#dbeafe' },
                  HOD:   { bg:'#faf5ff', text:'#7c3aed', border:'#c4b5fd', activeBg:'#ede9fe' },
                }[r] || { bg:'#f8fafc', text:'#475569', border:'#e2e8f0', activeBg:'#f1f5f9' };
                return (
                  <button key={r} type="button" onClick={()=>toggleRole(r)} style={{
                    flex:1, padding:'7px 0', fontSize:12.5, fontWeight:600, borderRadius:10, cursor:'pointer', transition:'all .15s',
                    border:`1.5px solid ${active ? styles.border : '#e2e8f0'}`,
                    background: active ? styles.activeBg : '#fafafa',
                    color: active ? styles.text : '#94a3b8',
                    boxShadow: active ? `0 0 0 3px ${styles.border}40` : 'none',
                  }}>{r}</button>
                );
              })}
            </div>
          </div>

          {/* Bulk upload — add mode only */}
          {!user && (
            <div style={{ borderRadius:10, border:'1.5px dashed #e2e8f0', padding:'10px 12px' }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Bulk Add Users (CSV)</div>
              <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:8 }}>
                <input type="file" accept=".csv,text/csv" onChange={(e)=>{setBulkFile(e.target.files?.[0]||null);setBulkMsg('');}}
                  className="text-[12px] file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1 file:text-[11px] file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
                <button style={{ padding:'5px 12px', fontSize:11.5, fontWeight:600, borderRadius:8, border:'none', cursor:'pointer', background:(!bulkSaving&&bulkFile)?'#059669':'#d1fae5', color:(!bulkSaving&&bulkFile)?'#fff':'#6ee7b7' }}
                  disabled={bulkSaving||!bulkFile} onClick={uploadBulkUsers}>
                  {bulkSaving?'⏳ Uploading…':'⬆ Upload CSV'}
                </button>
                <button style={{ padding:'5px 12px', fontSize:11.5, fontWeight:600, borderRadius:8, border:'1.5px solid #e2e8f0', cursor:'pointer', background:'#fff', color:'#64748b' }}
                  onClick={downloadUserSample}>⬇ Sample</button>
              </div>
              {bulkMsg && <div style={{ fontSize:12, marginTop:6, color: bulkMsg.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{bulkMsg}</div>}
              <div style={{ fontSize:10, color:'#94a3b8', marginTop:5 }}>Format: name, email, password, role, user_role, phone, department</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'10px 18px', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'flex-end', gap:8, borderRadius:'0 0 20px 20px', background:'#fafafa' }}>
          <button onClick={onClose} style={{ padding:'7px 16px', fontSize:13, fontWeight:600, borderRadius:10, border:'1.5px solid #e2e8f0', cursor:'pointer', background:'#fff', color:'#475569' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding:'7px 20px', fontSize:13, fontWeight:700, borderRadius:10, border:'none', cursor:'pointer', background:saving?'#a5b4fc':iconGrad, color:'#fff', opacity:saving?.7:1, boxShadow:saving?'none':iconShadow, transition:'all .15s' }}>
            {saving?'Saving…':'Save'}
          </button>
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={onClose}>
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
  const [focus, setFocus] = useState(false);
  return (
    <div>
      <label style={{ display:'block', fontSize:10, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>
        {label}
        {sublabel && <span style={{ textTransform:'none', fontWeight:400, color:'#94a3b8', marginLeft:4, fontSize:9.5 }}>({sublabel})</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete || (type === 'password' ? 'new-password' : 'off')}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width:'100%', boxSizing:'border-box', padding:'6px 10px', fontSize:12.5,
          color:'#1e293b', background:'#f8fafc', border:`1.5px solid ${focus ? '#818cf8' : '#e2e8f0'}`,
          borderRadius:8, outline:'none', fontFamily:'inherit',
          boxShadow: focus ? '0 0 0 3px rgba(129,140,248,0.15)' : 'none', transition:'border-color .15s,box-shadow .15s',
        }}
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

'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfileClient({ me, notificationEmail }) {
  const router = useRouter();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    name: me?.name || '',
    email: me?.email || '',
    notificationEmail: notificationEmail || '',
    phone: me?.phone || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [picture, setPicture] = useState(me?.picture || null);
  const [pictureChanged, setPictureChanged] = useState(false);
  const [saving, setSaving] = useState(false);

  const initials = (form.name || 'U').split(' ').filter(Boolean).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const role = me?.roles?.[0] || 'User';

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
      const b64 = canvas.toDataURL('image/jpeg', 0.75);
      setPicture(b64);
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
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      alert('New passwords do not match');
      return;
    }
    setSaving(true);
    const payload = { ...form };
    if (pictureChanged) payload.picture = picture;
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) { alert('Profile updated'); router.refresh(); }
    else alert('Failed to save');
  }

  return (
    <div className="space-y-6 animate-fade-in">

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        {/* Identity card */}
        <div className="card overflow-hidden">
          <div className="h-24 bg-gradient-to-br from-primary-500 via-primary-600 to-violet-600"></div>
          <div className="px-6 pb-6 -mt-12">
            <div className="relative w-24 h-24">
              {picture ? (
                <img
                  src={picture}
                  alt="Profile"
                  className="w-24 h-24 rounded-2xl object-cover shadow-elevated ring-4 ring-white"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-amber-400 to-pink-500 grid place-items-center text-white text-2xl font-bold shadow-elevated ring-4 ring-white">
                  {initials}
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="text-lg font-semibold text-slate-900">{form.name || '—'}</div>
              <div className="text-sm text-slate-500">{form.email || '—'}</div>
              <span className="pill bg-amber-50 text-amber-700 border border-amber-100 mt-2">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7Z"/></svg>
                {role}
              </span>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                className="btn-secondary !py-1.5 text-xs flex-1"
                onClick={() => fileRef.current?.click()}
              >
                Change Photo
              </button>
              <button
                className="btn-ghost !py-1.5 text-xs text-red-600 hover:bg-red-50 flex-1"
                onClick={removePicture}
              >
                Remove
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Department</div>
                <div className="text-sm font-medium text-slate-800 mt-0.5">{me?.department || '—'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Phone</div>
                <div className="text-sm font-medium text-slate-800 mt-0.5">{form.phone || '—'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Forms */}
        <div className="space-y-6">
          <Section title="Personal Information" desc="Public profile details">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Full Name"     value={form.name}  onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Email Address" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
              <Field label="Phone Number"  value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              <Field
                label="Notification Email"
                value={form.notificationEmail}
                onChange={(v) => setForm({ ...form, notificationEmail: v })}
                placeholder="yourrealemail@gmail.com"
                hint="Real Gmail/Outlook for task notifications"
              />
            </div>
          </Section>

          <Section title="Security" desc="Change your account password">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Current Password" type="password" value={form.currentPassword} onChange={(v) => setForm({ ...form, currentPassword: v })} placeholder="••••••" />
              <Field label="New Password"     type="password" value={form.newPassword}     onChange={(v) => setForm({ ...form, newPassword: v })}     placeholder="Enter new password" />
              <Field label="Confirm Password" type="password" value={form.confirmPassword} onChange={(v) => setForm({ ...form, confirmPassword: v })} placeholder="Confirm new password" />
            </div>
          </Section>

          <div className="flex justify-end gap-2">
            <button className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, desc, children }) {
  return (
    <div className="card p-5">
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, hint }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input" />
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

'use client';
import { useState } from 'react';
import * as XLSX from 'xlsx';

export default function DeveloperPage() {
  const [password,   setPassword]   = useState('');
  const [showPass,   setShowPass]   = useState(false);
  const [authed,     setAuthed]     = useState(false);
  const [secret,     setSecret]     = useState('');
  const [enabled,    setEnabled]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [confirm,          setConfirm]          = useState(false);
  const [resetOpen,        setResetOpen]        = useState(false);
  const [resetInput,       setResetInput]       = useState('');
  const [resetting,        setResetting]        = useState(false);
  const [resetDone,        setResetDone]        = useState(false);
  const [usersOpen,        setUsersOpen]        = useState(false);
  const [usersInput,       setUsersInput]       = useState('');
  const [deletingUsers,    setDeletingUsers]    = useState(false);
  const [usersDone,        setUsersDone]        = useState(false);
  const [newAdminCreds,    setNewAdminCreds]    = useState(null);
  const [backups,          setBackups]          = useState([]);
  const [loadingBackups,   setLoadingBackups]   = useState(false);
  const [restoring,        setRestoring]        = useState(null);
  const [restoreDone,      setRestoreDone]      = useState(false);
  const [confirmRestore,   setConfirmRestore]   = useState(null); // backup object to confirm
  const [error,            setError]            = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setError('');
    const res = await fetch(`/api/developer/access?secret=${encodeURIComponent(password)}`);
    const d   = await res.json();
    setLoading(false);
    if (!res.ok) { setError('Wrong password. Try again.'); return; }
    setSecret(password);
    setEnabled(d.enabled);
    setAuthed(true);
  }

  async function toggle() {
    setConfirm(false);
    setSaving(true); setError('');
    const res = await fetch(`/api/developer/access?secret=${encodeURIComponent(secret)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    const d = await res.json();
    if (res.ok) setEnabled(d.enabled);
    else setError(d.error || 'Failed');
    setSaving(false);
  }


  async function resetData() {
    if (resetInput !== 'DELETE') return;
    setResetting(true); setError('');
    const res = await fetch(`/api/developer/reset?secret=${encodeURIComponent(secret)}`, { method: 'POST' });
    setResetting(false);
    if (res.ok) { setResetDone(true); setResetOpen(false); setResetInput(''); }
    else { const d = await res.json(); setError(d.error || 'Reset failed'); setResetOpen(false); }
  }

  async function loadBackups() {
    setLoadingBackups(true);
    const res = await fetch(`/api/developer/backups?secret=${encodeURIComponent(secret)}`);
    const d = await res.json();
    if (res.ok) setBackups(d.backups || []);
    setLoadingBackups(false);
  }

  async function doRestore(id) {
    setConfirmRestore(null);
    setRestoring(id); setRestoreDone(false); setError('');
    try {
      const res = await fetch(`/api/developer/restore?secret=${encodeURIComponent(secret)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = await res.json();
      if (res.ok) { setRestoreDone(true); }
      else { setError(d.error || 'Restore failed'); }
    } catch (e) {
      setError('Network error: ' + e.message);
    }
    setRestoring(null);
  }

  async function deleteUsers(mode) {
    if (usersInput !== 'DELETE') return;
    setDeletingUsers(true); setError('');
    const res = await fetch(`/api/developer/reset-users?secret=${encodeURIComponent(secret)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const d = await res.json();
    setDeletingUsers(false);
    if (res.ok) { setUsersDone(true); setNewAdminCreds(d.admin || null); setUsersOpen(false); setUsersInput(''); }
    else { setError(d.error || 'Delete failed'); setUsersOpen(false); }
  }

  async function exportExcel() {
    setExporting(true); setError('');
    const res = await fetch(`/api/developer/export?secret=${encodeURIComponent(secret)}`);
    if (!res.ok) { setError('Export failed'); setExporting(false); return; }
    const data = await res.json();
    const date = new Date().toISOString().slice(0, 10);

    const wb = XLSX.utils.book_new();
    const sheets = [
      { name: 'Tasks',      rows: data.delegations },
      { name: 'Users',      rows: data.users       },
      { name: 'Checklists', rows: data.masters     },
      { name: 'Holidays',   rows: data.holidays    },
    ];
    sheets.forEach(({ name, rows }) => {
      const ws = XLSX.utils.json_to_sheet(rows || []);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, `manpur_petrol_pump_${date}.xlsx`);
    setExporting(false);
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 sm:p-6" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      <div className="app-bg" aria-hidden="true">
      </div>

      <div className={`relative z-10 w-full ${authed ? 'max-w-2xl' : 'max-w-md'} animate-fade-in`}>

        {!authed ? (
          <div className="card-glass stone-grain p-8 sm:p-10">
            <div className="flex items-center gap-3 mb-7">
              <div className="w-12 h-12 rounded-xl grid place-items-center shrink-0 shadow-gold" style={{ background: 'linear-gradient(135deg, #F3C955 0%, #EEBC2E 55%, #B78A16 100%)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div>
                <h1 className="page-title">Developer Panel</h1>
                <p className="page-sub">e-marketing.io</p>
              </div>
            </div>

            <form onSubmit={handleLogin}>
              <label className="label">Password</label>
              <div className="relative mb-1">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter developer password"
                  autoFocus
                  required
                  className={`input ${error ? '!border-red-300' : ''}`}
                  style={{ paddingRight: 42, background: error ? 'rgba(254,242,242,0.7)' : undefined }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary-600 transition">
                  {showPass ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {error && <p className="text-red-500 text-[11.5px] mb-2">{error}</p>}
              <button type="submit" disabled={loading || !password} className="btn-primary w-full justify-center !py-2.5 mt-3">
                {loading ? 'Verifying…' : 'Login'}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-3.5">

            <div className="flex items-center gap-3 px-1">
              <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0 shadow-gold" style={{ background: 'linear-gradient(135deg, #F3C955 0%, #EEBC2E 55%, #B78A16 100%)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div>
                <h1 className="page-title">Developer Panel</h1>
                <p className="page-sub">e-marketing.io</p>
              </div>
            </div>

            {/* Status card */}
            <div className="card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${enabled ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${enabled ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                </div>
                <div className="min-w-0">
                  <div className="section-title">{enabled ? 'Dashboard Active' : 'Dashboard Suspended'}</div>
                  <div className="text-[11.5px] text-slate-500 truncate">
                    Client: <strong className="text-slate-800">Celestile-TaskManager</strong>
                  </div>
                </div>
              </div>
              <button onClick={() => setConfirm(true)} disabled={saving} className={`${enabled ? 'btn-danger' : 'btn-success'} shrink-0`}>
                {saving ? 'Saving…' : enabled ? 'Suspend Dashboard' : 'Restore Dashboard'}
              </button>
            </div>

            {/* Export card */}
            <div className="card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-primary-50 grid place-items-center shrink-0">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#B78A16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="section-title">Export All Data</div>
                  <div className="text-[11.5px] text-slate-500">Tasks, users, checklists &amp; holidays as Excel</div>
                </div>
              </div>
              <button onClick={exportExcel} disabled={exporting} className="btn-secondary shrink-0">
                {exporting ? 'Exporting…' : 'Export (.xlsx)'}
              </button>
            </div>

            {/* Danger zone */}
            <div className="card p-4 sm:p-5" style={{ borderColor: 'rgba(220,38,38,0.18)' }}>
              <div className="flex items-center gap-2 mb-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                  <path d="M12 9v4"/><path d="M12 17h.01"/>
                </svg>
                <span className="section-title text-red-700">Danger Zone</span>
              </div>
              <p className="text-[11px] text-slate-500 mb-3.5">
                These actions are permanent. A backup is created automatically before any deletion.
              </p>
              <div className="grid sm:grid-cols-2 gap-2.5">
                <button
                  onClick={() => { setResetOpen(true); setResetInput(''); setResetDone(false); }}
                  className="btn-danger w-full justify-start gap-2 !py-2.5"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  Delete All Tasks
                </button>
                <button
                  onClick={() => { setUsersOpen(true); setUsersInput(''); setUsersDone(false); }}
                  className="btn-danger w-full justify-start gap-2 !py-2.5"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/>
                  </svg>
                  Delete All Users
                </button>
              </div>

              {resetDone && (
                <p className="text-emerald-600 text-[12.5px] font-semibold mt-3 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  All tasks deleted successfully.
                </p>
              )}
              {usersDone && newAdminCreds && (
                <div className="mt-3 rounded-xl p-3.5 text-left bg-emerald-50/70 border border-emerald-200">
                  <p className="text-emerald-700 text-[12.5px] font-bold mb-2.5 flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    All users deleted. New admin created:
                  </p>
                  <div className="bg-white rounded-lg p-2.5 border border-emerald-100">
                    <div className="text-[11px] text-slate-500 mb-0.5">Email</div>
                    <div className="text-[13px] font-bold text-slate-900 font-mono mb-2">{newAdminCreds.email}</div>
                    <div className="text-[11px] text-slate-500 mb-0.5">Password</div>
                    <div className="text-[13px] font-bold text-slate-900 font-mono">{newAdminCreds.password}</div>
                  </div>
                  <p className="text-[10.5px] text-slate-400 mt-2">Save these credentials before leaving this page.</p>
                </div>
              )}
            </div>

            {/* Restore section */}
            <div className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-primary-50 grid place-items-center shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B78A16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="section-title">Backups &amp; Restore</div>
                    <div className="text-[11px] text-slate-500">Created automatically before every delete</div>
                  </div>
                </div>
                <button onClick={loadBackups} disabled={loadingBackups} className="btn-secondary shrink-0">
                  {loadingBackups ? 'Loading…' : 'View Backups'}
                </button>
              </div>

              {restoreDone && (
                <p className="text-emerald-600 text-[12.5px] font-semibold mt-2.5 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  Data restored successfully!
                </p>
              )}

              {backups.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-200 max-h-56 overflow-y-auto overflow-x-hidden">
                  {backups.map((b, i) => {
                    const date = new Date(b.created_at);
                    const expires = new Date(b.expires_at);
                    const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={b.id} className={`table-row flex items-center justify-between gap-3 px-3 py-2.5 ${i === 0 ? 'border-t-0' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-semibold text-slate-800 truncate">{b.label || 'Backup'}</div>
                          <div className="text-[10.5px] text-slate-400 mt-0.5">{date.toLocaleString('en-IN')} &middot; {daysLeft}d left</div>
                        </div>
                        <button
                          onClick={() => setConfirmRestore(b)}
                          disabled={!!restoring}
                          className="btn-danger btn-sm !px-3 !py-1.5 shrink-0"
                        >
                          {restoring === b.id ? '…' : 'Restore'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {backups.length === 0 && !loadingBackups && backups !== null && (
                <p className="text-[11.5px] text-slate-400 text-center mt-3">
                  No backups found. Backups are created automatically before any delete.
                </p>
              )}
            </div>

            {error && <p className="text-red-500 text-[12.5px] px-1">{error}</p>}

            <div className="flex items-center justify-between px-1 pt-1">
              <button onClick={() => { setAuthed(false); setPassword(''); setError(''); }} className="btn-ghost !px-2">
                Logout
              </button>
              <p className="text-[10.5px] text-slate-400">Changes apply immediately for all users.</p>
            </div>
          </div>
        )}
      </div>

      {/* Confirm suspend/restore modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={() => setConfirm(false)}>
          <div className="card max-w-sm w-full p-7 text-center animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className={`w-12 h-12 rounded-xl mx-auto mb-4 grid place-items-center ${enabled ? 'bg-red-50' : 'bg-emerald-50'}`}>
              {enabled ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>
                </svg>
              )}
            </div>
            <h2 className="section-title mb-2">{enabled ? 'Suspend Dashboard?' : 'Restore Dashboard?'}</h2>
            <p className="text-[13px] text-slate-500 mb-6 leading-relaxed">
              {enabled
                ? 'The client dashboard will be suspended immediately. No one will be able to log in.'
                : 'The dashboard will be restored immediately. The client will regain access.'}
            </p>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirm(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={toggle} className={`${enabled ? 'btn-danger' : 'btn-success'} flex-1 justify-center`}>
                {enabled ? 'Yes, Suspend' : 'Yes, Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset modal */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={() => setResetOpen(false)}>
          <div className="card max-w-sm w-full p-7 text-center animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-xl mx-auto mb-4 grid place-items-center bg-red-50">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <h2 className="section-title mb-2">Delete All Tasks?</h2>
            <p className="text-[13px] text-slate-500 mb-5 leading-relaxed">
              This will permanently delete all delegations, checklists, and transfers. This action <strong className="text-slate-700">cannot be undone</strong>.
            </p>
            <p className="text-[13px] text-slate-800 font-semibold mb-2">
              Type <span className="text-red-500 font-mono">DELETE</span> to confirm
            </p>
            <input
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value)}
              placeholder="Type DELETE here"
              autoFocus
              className={`input text-center font-semibold tracking-wide mb-5 ${resetInput === 'DELETE' ? '!border-red-300' : ''}`}
            />
            <div className="flex gap-2.5">
              <button onClick={() => setResetOpen(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={resetData} disabled={resetInput !== 'DELETE' || resetting} className="btn-danger flex-1 justify-center">
                {resetting ? 'Deleting…' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm restore modal */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={() => setConfirmRestore(null)}>
          <div className="card max-w-sm w-full p-7 text-center animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-xl mx-auto mb-4 grid place-items-center bg-primary-50">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B78A16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/>
              </svg>
            </div>
            <h2 className="section-title mb-2">Restore Backup?</h2>
            <p className="text-[13px] text-slate-600 mb-1 leading-relaxed">
              <strong>{confirmRestore.label}</strong>
            </p>
            <p className="text-[11.5px] text-slate-400 mb-5">
              {new Date(confirmRestore.created_at).toLocaleString('en-IN')}
            </p>
            <p className="text-[13px] text-red-600 font-semibold mb-5 flex items-center justify-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
              </svg>
              Current data will be permanently replaced.
            </p>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmRestore(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={() => doRestore(confirmRestore.id)} className="btn-danger flex-1 justify-center">Yes, Restore</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete users modal */}
      {usersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={() => setUsersOpen(false)}>
          <div className="card max-w-sm w-full p-7 text-center animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-xl mx-auto mb-4 grid place-items-center bg-red-50">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/>
              </svg>
            </div>
            <h2 className="section-title mb-2">Delete All Users?</h2>
            <p className="text-[13px] text-slate-500 mb-4 leading-relaxed">
              Choose what to delete. A backup is created automatically before any action.
            </p>

            <div className="space-y-2 mb-4">
              {[
                { mode: 'users',  label: 'Only Users',  desc: 'Delete all non-admin users. Admin accounts stay.',       bg: 'bg-amber-50',  border: 'border-amber-200',
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> },
                { mode: 'admins', label: 'Only Admins', desc: 'Delete all admin users. A fresh admin will be created.', bg: 'bg-orange-50', border: 'border-orange-200',
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg> },
                { mode: 'all',    label: 'All Users',   desc: 'Delete everyone. A fresh admin will be created.',        bg: 'bg-red-50',    border: 'border-red-200',
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg> },
              ].map(({ mode, label, desc, bg, border, icon }) => (
                <div key={mode} className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${bg} ${border}`}>
                  <span className="shrink-0">{icon}</span>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-[12.5px] font-bold text-slate-900">{label}</div>
                    <div className="text-[10.5px] text-slate-500 mt-0.5">{desc}</div>
                  </div>
                  <button
                    onClick={() => deleteUsers(mode)}
                    disabled={usersInput !== 'DELETE' || deletingUsers}
                    className="btn-danger btn-sm !px-3 !py-1.5 shrink-0"
                  >
                    {deletingUsers ? '…' : 'Delete'}
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[13px] text-slate-800 font-semibold mb-2">
              Type <span className="text-red-500 font-mono">DELETE</span> to enable
            </p>
            <input
              value={usersInput}
              onChange={(e) => setUsersInput(e.target.value)}
              placeholder="Type DELETE here"
              autoFocus
              className={`input text-center font-semibold tracking-wide mb-3 ${usersInput === 'DELETE' ? '!border-red-300' : ''}`}
            />
            <button onClick={() => setUsersOpen(false)} className="btn-secondary w-full justify-center">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

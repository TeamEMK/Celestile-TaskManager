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
    XLSX.writeFile(wb, `manpur_patrol_pump_${date}.xlsx`);
    setExporting(false);
  }

  const S = {
    page: {
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: 'system-ui, sans-serif',
    },
    card: {
      background: '#fff', borderRadius: '20px', padding: '48px 40px',
      maxWidth: '400px', width: '100%',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9',
    },
    iconWrap: {
      width: '52px', height: '52px', borderRadius: '14px',
      background: '#eff6ff', display: 'flex', alignItems: 'center',
      justifyContent: 'center', margin: '0 auto 16px',
    },
  };

  return (
    <div style={S.page}>
      <div style={S.card}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={S.iconWrap}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
              stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>
            Developer Panel
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>e-marketing.io</p>
        </div>

        {!authed ? (
          /* ── Login form ── */
          <form onSubmit={handleLogin}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              Password
            </label>
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter developer password"
                autoFocus
                required
                style={{
                  width: '100%', padding: '11px 42px 11px 14px', borderRadius: '10px',
                  border: `1.5px solid ${error ? '#fca5a5' : '#e2e8f0'}`,
                  fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                  background: error ? '#fff5f5' : '#fff', color: '#0f172a',
                }}
              />
              <button type="button" onClick={() => setShowPass(!showPass)} style={{
                position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                color: '#94a3b8', display: 'flex', alignItems: 'center',
              }}>
                {showPass ? (
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
                )}
              </button>
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: '12.5px', margin: '-8px 0 12px' }}>{error}</p>}
            <button type="submit" disabled={loading || !password} style={{
              width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
              background: loading || !password ? '#cbd5e1' : '#3b82f6',
              color: '#fff', fontSize: '14px', fontWeight: '700',
              cursor: loading || !password ? 'not-allowed' : 'pointer',
            }}>
              {loading ? 'Verifying…' : 'Login'}
            </button>
          </form>
        ) : (
          /* ── Control panel ── */
          <div style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '7px 16px', borderRadius: '999px', marginBottom: '20px',
              background: enabled ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${enabled ? '#bbf7d0' : '#fecaca'}`,
              fontSize: '13px', fontWeight: '600',
              color: enabled ? '#16a34a' : '#dc2626',
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: enabled ? '#22c55e' : '#ef4444' }} />
              {enabled ? 'Dashboard Active' : 'Dashboard Suspended'}
            </div>

            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
              Client: <strong style={{ color: '#0f172a' }}>Manpur Patrol Pump</strong>
            </p>

            {/* Suspend / Restore */}
            <button onClick={() => setConfirm(true)} disabled={saving} style={{
              width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: '700', color: '#fff',
              background: enabled ? '#ef4444' : '#22c55e',
              boxShadow: enabled ? '0 4px 14px rgba(239,68,68,0.3)' : '0 4px 14px rgba(34,197,94,0.3)',
              opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Saving…' : enabled ? '🔴  Suspend Dashboard' : '🟢  Restore Dashboard'}
            </button>

            {/* Export Excel */}
            <button onClick={exportExcel} disabled={exporting} style={{
              width: '100%', padding: '12px', borderRadius: '12px', border: 'none',
              cursor: exporting ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: '600', color: '#16a34a',
              background: '#f0fdf4', marginTop: '10px',
              opacity: exporting ? 0.7 : 1,
            }}>
              {exporting ? '⏳ Exporting…' : '📊 Export All Data (Excel)'}
            </button>

            {/* Delete buttons row */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button onClick={() => { setResetOpen(true); setResetInput(''); setResetDone(false); }} style={{
                flex: 1, padding: '12px', borderRadius: '12px',
                border: '1.5px solid #fecaca', background: '#fff5f5',
                cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#ef4444',
              }}>
                🗑️ Delete All Tasks
              </button>
              <button onClick={() => { setUsersOpen(true); setUsersInput(''); setUsersDone(false); }} style={{
                flex: 1, padding: '12px', borderRadius: '12px',
                border: '1.5px solid #fed7aa', background: '#fff7ed',
                cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#ea580c',
              }}>
                👤 Delete All Users
              </button>
            </div>

            {resetDone && (
              <p style={{ color: '#16a34a', fontSize: '13px', marginTop: '10px', fontWeight: '600' }}>
                ✓ All tasks deleted successfully.
              </p>
            )}
            {usersDone && newAdminCreds && (
              <div style={{
                marginTop: '12px', padding: '14px 16px', borderRadius: '12px',
                background: '#f0fdf4', border: '1.5px solid #86efac', textAlign: 'left',
              }}>
                <p style={{ color: '#16a34a', fontSize: '13px', fontWeight: '700', margin: '0 0 10px' }}>
                  ✓ All users deleted. New admin created:
                </p>
                <div style={{ background: '#fff', borderRadius: '8px', padding: '10px 12px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Email</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', fontFamily: 'monospace', marginBottom: '8px' }}>
                    {newAdminCreds.email}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Password</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', fontFamily: 'monospace' }}>
                    {newAdminCreds.password}
                  </div>
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '8px 0 0' }}>
                  Save these credentials before leaving this page.
                </p>
              </div>
            )}

            {/* ── Restore Section ── */}
            <div style={{ marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              <button onClick={loadBackups} disabled={loadingBackups} style={{
                width: '100%', padding: '11px', borderRadius: '12px',
                border: '1.5px solid #bfdbfe', background: '#eff6ff',
                cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#1d4ed8',
              }}>
                {loadingBackups ? '⏳ Loading…' : '🔄 View Backups (Restore Data)'}
              </button>

              {restoreDone && (
                <p style={{ color: '#16a34a', fontSize: '13px', marginTop: '8px', fontWeight: '600' }}>
                  ✓ Data restored successfully!
                </p>
              )}

              {backups.length > 0 && (
                <div style={{ marginTop: '12px', maxHeight: '220px', overflowY: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  {backups.map((b, i) => {
                    const date = new Date(b.created_at);
                    const expires = new Date(b.expires_at);
                    const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={b.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', borderBottom: i < backups.length - 1 ? '1px solid #f1f5f9' : 'none',
                        background: i % 2 === 0 ? '#fff' : '#fafafa',
                      }}>
                        <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {b.label || 'Backup'}
                          </div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                            {date.toLocaleString('en-IN')} · {daysLeft}d left
                          </div>
                        </div>
                        <button
                          onClick={() => setConfirmRestore(b)}
                          disabled={!!restoring}
                          style={{
                            marginLeft: '8px', padding: '5px 12px', borderRadius: '8px', border: 'none',
                            background: restoring ? '#cbd5e1' : '#3b82f6',
                            color: '#fff', fontSize: '11px', fontWeight: '700',
                            cursor: restoring ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          {restoring === b.id ? '⏳' : 'Restore'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {backups.length === 0 && !loadingBackups && backups !== null && (
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', textAlign: 'center' }}>
                  No backups found. Backups are created automatically before any delete.
                </p>
              )}
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '12px' }}>{error}</p>}

            <button onClick={() => { setAuthed(false); setPassword(''); setError(''); }} style={{
              marginTop: '20px', background: 'none', border: 'none',
              color: '#94a3b8', fontSize: '12px', cursor: 'pointer',
            }}>
              Logout
            </button>
            <p style={{ color: '#e2e8f0', fontSize: '11px', marginTop: '16px' }}>
              Changes apply immediately for all users.
            </p>
          </div>
        )}
      </div>

      {/* ── Confirm popup ── */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '24px',
        }} onClick={() => setConfirm(false)}>
          <div style={{
            background: '#fff', borderRadius: '16px', padding: '32px 28px',
            maxWidth: '340px', width: '100%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px', margin: '0 auto 16px',
              background: enabled ? '#fef2f2' : '#f0fdf4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
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
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px' }}>
              {enabled ? 'Suspend Dashboard?' : 'Restore Dashboard?'}
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 24px', lineHeight: '1.5' }}>
              {enabled
                ? 'The client dashboard will be suspended immediately. No one will be able to log in.'
                : 'The dashboard will be restored immediately. The client will regain access.'}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirm(false)} style={{
                flex: 1, padding: '10px', borderRadius: '10px', border: '1.5px solid #e2e8f0',
                background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={toggle} style={{
                flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                background: enabled ? '#ef4444' : '#22c55e',
                color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
              }}>
                {enabled ? 'Yes, Suspend' : 'Yes, Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Reset modal ── */}
      {resetOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '24px',
        }} onClick={() => setResetOpen(false)}>
          <div style={{
            background: '#fff', borderRadius: '16px', padding: '32px 28px',
            maxWidth: '360px', width: '100%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px', margin: '0 auto 16px',
              background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px' }}>
              Delete All Tasks?
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: '1.5' }}>
              This will permanently delete all delegations, checklists, and transfers. This action <strong>cannot be undone</strong>.
            </p>
            <p style={{ fontSize: '13px', color: '#0f172a', margin: '0 0 8px', fontWeight: '600' }}>
              Type <span style={{ color: '#ef4444', fontFamily: 'monospace' }}>DELETE</span> to confirm
            </p>
            <input
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value)}
              placeholder="Type DELETE here"
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px', boxSizing: 'border-box',
                border: `1.5px solid ${resetInput === 'DELETE' ? '#fca5a5' : '#e2e8f0'}`,
                fontSize: '14px', outline: 'none', marginBottom: '20px',
                textAlign: 'center', fontWeight: '600', letterSpacing: '1px',
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setResetOpen(false)} style={{
                flex: 1, padding: '10px', borderRadius: '10px', border: '1.5px solid #e2e8f0',
                background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={resetData} disabled={resetInput !== 'DELETE' || resetting} style={{
                flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                background: resetInput === 'DELETE' ? '#ef4444' : '#fca5a5',
                color: '#fff', fontSize: '13px', fontWeight: '700',
                cursor: resetInput !== 'DELETE' || resetting ? 'not-allowed' : 'pointer',
              }}>
                {resetting ? 'Deleting…' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Confirm Restore modal ── */}
      {confirmRestore && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '24px',
        }} onClick={() => setConfirmRestore(null)}>
          <div style={{
            background: '#fff', borderRadius: '16px', padding: '32px 28px',
            maxWidth: '360px', width: '100%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px', margin: '0 auto 16px',
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px' }}>
              Restore Backup?
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 6px', lineHeight: '1.5' }}>
              <strong>{confirmRestore.label}</strong>
            </p>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 24px' }}>
              {new Date(confirmRestore.created_at).toLocaleString('en-IN')}
            </p>
            <p style={{ fontSize: '13px', color: '#dc2626', margin: '0 0 20px', fontWeight: '600' }}>
              ⚠️ Current data will be permanently replaced.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmRestore(null)} style={{
                flex: 1, padding: '10px', borderRadius: '10px', border: '1.5px solid #e2e8f0',
                background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={() => doRestore(confirmRestore.id)} style={{
                flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                background: '#3b82f6', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
              }}>
                Yes, Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Users modal ── */}
      {usersOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '24px',
        }} onClick={() => setUsersOpen(false)}>
          <div style={{
            background: '#fff', borderRadius: '16px', padding: '32px 28px',
            maxWidth: '360px', width: '100%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px', margin: '0 auto 16px',
              background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px' }}>
              Delete All Users?
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px', lineHeight: '1.5' }}>
              Choose what to delete. A backup is created automatically before any action.
            </p>

            {/* 3 option cards */}
            {[
              { mode: 'users',  icon: '👤', label: 'Only Users',   desc: 'Delete all non-admin users. Admin accounts stay.', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
              { mode: 'admins', icon: '🛡️', label: 'Only Admins', desc: 'Delete all admin users. A fresh admin will be created.', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
              { mode: 'all',    icon: '🗑️', label: 'All Users',   desc: 'Delete everyone. A fresh admin will be created.', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            ].map(({ mode, icon, label, desc, color, bg, border }) => (
              <div key={mode} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '10px', marginBottom: '8px',
                background: bg, border: `1.5px solid ${border}`,
              }}>
                <span style={{ fontSize: '20px' }}>{icon}</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{label}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{desc}</div>
                </div>
                <button
                  onClick={() => deleteUsers(mode)}
                  disabled={usersInput !== 'DELETE' || deletingUsers}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', border: 'none',
                    background: usersInput === 'DELETE' ? color : '#cbd5e1',
                    color: '#fff', fontSize: '12px', fontWeight: '700',
                    cursor: usersInput !== 'DELETE' || deletingUsers ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {deletingUsers ? '…' : 'Delete'}
                </button>
              </div>
            ))}

            <p style={{ fontSize: '13px', color: '#0f172a', margin: '12px 0 6px', fontWeight: '600' }}>
              Type <span style={{ color: '#ea580c', fontFamily: 'monospace' }}>DELETE</span> to enable
            </p>
            <input
              value={usersInput}
              onChange={(e) => setUsersInput(e.target.value)}
              placeholder="Type DELETE here"
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px', boxSizing: 'border-box',
                border: `1.5px solid ${usersInput === 'DELETE' ? '#fca5a5' : '#e2e8f0'}`,
                fontSize: '14px', outline: 'none', marginBottom: '12px',
                textAlign: 'center', fontWeight: '600', letterSpacing: '1px',
              }}
            />
            <button onClick={() => setUsersOpen(false)} style={{
              width: '100%', padding: '10px', borderRadius: '10px', border: '1.5px solid #e2e8f0',
              background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

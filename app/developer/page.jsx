'use client';
import { useState } from 'react';

export default function DeveloperPage() {
  const [password, setPassword]     = useState('');
  const [authed,   setAuthed]       = useState(false);
  const [secret,   setSecret]       = useState('');
  const [enabled,  setEnabled]      = useState(null);
  const [loading,  setLoading]      = useState(false);
  const [saving,   setSaving]       = useState(false);
  const [error,    setError]        = useState('');

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

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', padding: '48px 40px',
        maxWidth: '400px', width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9',
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: '#eff6ff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 16px',
          }}>
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

        {/* Password form */}
        {!authed ? (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter developer password"
                autoFocus
                required
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: '10px',
                  border: `1.5px solid ${error ? '#fca5a5' : '#e2e8f0'}`,
                  fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                  background: error ? '#fff5f5' : '#fff',
                  color: '#0f172a',
                }}
              />
              {error && (
                <p style={{ color: '#ef4444', fontSize: '12.5px', marginTop: '6px', marginBottom: 0 }}>
                  {error}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !password}
              style={{
                width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                background: loading || !password ? '#cbd5e1' : '#3b82f6',
                color: '#fff', fontSize: '14px', fontWeight: '700',
                cursor: loading || !password ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {loading ? 'Verifying…' : 'Login'}
            </button>
          </form>
        ) : (
          /* Control Panel */
          <div style={{ textAlign: 'center' }}>
            {/* Status badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '7px 16px', borderRadius: '999px', marginBottom: '28px',
              background: enabled ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${enabled ? '#bbf7d0' : '#fecaca'}`,
              fontSize: '13px', fontWeight: '600',
              color: enabled ? '#16a34a' : '#dc2626',
            }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: enabled ? '#22c55e' : '#ef4444',
              }} />
              {enabled ? 'Dashboard Active' : 'Dashboard Suspended'}
            </div>

            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '28px' }}>
              Client: <strong style={{ color: '#0f172a' }}>India Automotive</strong>
            </p>

            <button
              onClick={toggle}
              disabled={saving}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '15px', fontWeight: '700', color: '#fff',
                background: enabled ? '#ef4444' : '#22c55e',
                boxShadow: enabled
                  ? '0 4px 14px rgba(239,68,68,0.3)'
                  : '0 4px 14px rgba(34,197,94,0.3)',
                opacity: saving ? 0.7 : 1,
                transition: 'all 0.2s',
              }}
            >
              {saving ? 'Saving…' : enabled ? '🔴  Suspend Dashboard' : '🟢  Restore Dashboard'}
            </button>

            {error && (
              <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '14px' }}>{error}</p>
            )}

            <button
              onClick={() => { setAuthed(false); setPassword(''); setError(''); }}
              style={{
                marginTop: '20px', background: 'none', border: 'none',
                color: '#94a3b8', fontSize: '12px', cursor: 'pointer',
              }}
            >
              Logout
            </button>

            <p style={{ color: '#e2e8f0', fontSize: '11px', marginTop: '20px' }}>
              Changes apply immediately for all users.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

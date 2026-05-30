'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function Panel() {
  const searchParams = useSearchParams();
  const secret = searchParams.get('secret') || '';

  const [enabled, setEnabled]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [error,   setError]     = useState('');

  useEffect(() => {
    if (!secret) { setLoading(false); return; }
    fetch(`/api/developer/access?secret=${secret}`)
      .then((r) => r.json())
      .then((d) => { setEnabled(d.enabled ?? null); setLoading(false); })
      .catch(() => { setError('Failed to connect'); setLoading(false); });
  }, [secret]);

  async function toggle() {
    setSaving(true); setError('');
    const res = await fetch(`/api/developer/access?secret=${secret}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    const d = await res.json();
    if (res.ok) setEnabled(d.enabled);
    else setError(d.error || 'Failed');
    setSaving(false);
  }

  if (!secret) {
    return (
      <div style={{ color: '#ef4444', textAlign: 'center', padding: '40px' }}>
        ❌ Secret missing — open this page with <code>?secret=YOUR_SECRET</code>
      </div>
    );
  }

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>Loading…</div>;

  if (error === 'Unauthorized' || (error && enabled === null)) {
    return <div style={{ color: '#ef4444', textAlign: 'center', padding: '40px' }}>❌ Invalid secret</div>;
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '10px',
        padding: '8px 18px', borderRadius: '999px', marginBottom: '32px',
        background: enabled ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${enabled ? '#bbf7d0' : '#fecaca'}`,
        fontSize: '14px', fontWeight: '600',
        color: enabled ? '#16a34a' : '#dc2626',
      }}>
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: enabled ? '#22c55e' : '#ef4444',
          boxShadow: enabled ? '0 0 0 3px #bbf7d0' : '0 0 0 3px #fecaca',
        }} />
        {enabled ? 'Dashboard Active' : 'Dashboard Suspended'}
      </div>

      <div style={{ marginBottom: '32px' }}>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 6px' }}>Client</p>
        <p style={{ color: '#0f172a', fontWeight: '700', fontSize: '20px', margin: 0 }}>
          India Automotive
        </p>
      </div>

      <button
        onClick={toggle}
        disabled={saving}
        style={{
          padding: '14px 40px', borderRadius: '12px', border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer',
          fontSize: '15px', fontWeight: '700',
          background: enabled ? '#ef4444' : '#22c55e',
          color: '#fff',
          boxShadow: enabled ? '0 4px 14px rgba(239,68,68,0.35)' : '0 4px 14px rgba(34,197,94,0.35)',
          transition: 'all 0.2s',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Saving…' : enabled ? '🔴 Suspend Access' : '🟢 Restore Access'}
      </button>

      {error && <p style={{ color: '#ef4444', marginTop: '16px', fontSize: '13px' }}>{error}</p>}

      <p style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '32px' }}>
        Changes take effect immediately for all users.
      </p>
    </div>
  );
}

export default function DeveloperPage() {
  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', padding: '48px 40px',
        maxWidth: '420px', width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9',
      }}>
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
            Developer Control Panel
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>e-marketing.io</p>
        </div>

        <Suspense fallback={<div style={{ textAlign: 'center', color: '#94a3b8' }}>Loading…</div>}>
          <Panel />
        </Suspense>
      </div>
    </div>
  );
}

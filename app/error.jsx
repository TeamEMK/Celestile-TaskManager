'use client';

// Route-level error boundary. Without this, an uncaught render error
// anywhere under app/ (e.g. a future hydration mismatch) unmounts the
// whole React tree and silently breaks client-side navigation — links
// stop working until the user manually reloads the page. This gives
// users a visible recovery path (Try again / Go home) instead.
export default function Error({ error, reset }) {
  return (
    <div style={{
      minHeight: '70vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', padding: '48px 40px',
        textAlign: 'center', maxWidth: '420px', width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9',
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '16px',
          background: '#fef2f2', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 20px',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', margin: '0 0 10px' }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 28px', lineHeight: '1.6' }}>
          This page hit an unexpected error. You can try again, or head back to the dashboard.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{
              padding: '10px 20px', borderRadius: '10px', border: 'none',
              background: '#0f172a', color: '#fff', fontSize: '14px',
              fontWeight: '600', cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.href = '/'; }}
            style={{
              padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0',
              background: '#fff', color: '#0f172a', fontSize: '14px',
              fontWeight: '600', cursor: 'pointer',
            }}
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}

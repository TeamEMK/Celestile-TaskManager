'use client';

// Root-level error boundary — catches errors thrown by app/layout.jsx
// itself (error.jsx alone can't, since it renders inside the layout).
// Must render its own <html>/<body> because it replaces the root layout.
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '24px',
        }}>
          <div style={{
            background: '#fff', borderRadius: '20px', padding: '48px 40px',
            textAlign: 'center', maxWidth: '420px', width: '100%',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9',
          }}>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', margin: '0 0 10px' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 28px', lineHeight: '1.6' }}>
              The application hit an unexpected error while loading.
            </p>
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
          </div>
        </div>
      </body>
    </html>
  );
}

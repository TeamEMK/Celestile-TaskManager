'use client';
import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [toast,    setToast]    = useState(null); // { msg, type }
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function showToast(msg, type = 'error') {
    setToast({ msg, type });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setToast(null);
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      showToast('Invalid email or password ❌', 'error');
    } else {
      showToast('Login successful! Redirecting… ✅', 'success');
      setTimeout(() => { window.location.href = '/'; }, 1000);
    }
  }

  return (
    <>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33%       { transform: translateY(-10px) rotate(-1deg); }
          66%       { transform: translateY(-5px) rotate(1deg); }
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .login-logo { animation: none; }
        .login-card { animation: fadeSlide 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        .login-input:focus { border-color: #C4714A !important; box-shadow: 0 0 0 3px rgba(196,113,74,0.12); }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, animation: 'toastIn 0.3s cubic-bezier(0.16,1,0.3,1) both',
          background: toast.type === 'success' ? '#1a2e1a' : '#2e1a1a',
          color: toast.type === 'success' ? '#4ade80' : '#f87171',
          padding: '12px 22px', borderRadius: '12px',
          fontSize: '13px', fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
          whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'radial-gradient(ellipse at 25% 60%, #F5C97A 0%, #FDEBC8 35%, #FDF6ED 65%, #FFFBF5 100%)',
      }}>
        <div className="login-card" style={{ width: '100%', maxWidth: '23rem' }}>

          {/* Card */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '1.5rem',
            padding: '2.25rem 2rem',
            boxShadow: '0 8px 40px rgba(180,120,50,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          }}>

            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <div className="login-logo" style={{
                width: '120px',
                height: '120px',
                margin: '0 auto 1rem',
                borderRadius: '1.5rem',
                overflow: 'hidden',
                background: '#ffffff',
                boxShadow: '0 8px 28px rgba(196,113,74,0.18), 0 2px 8px rgba(0,0,0,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <img
                  src="/logo.png"
                  alt="Manpur Petrol Pump"
                  width={120}
                  height={120}
                  style={{ objectFit: 'contain', borderRadius: '1.5rem', width: '120px', height: '120px' }}
                />
              </div>

              {/* TASK MANAGER label */}
              <div style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.26em',
                textTransform: 'uppercase',
                color: '#C4714A',
                marginBottom: '4px',
              }}>
                Task Manager
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '1.25rem' }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{
                    width: '5px', height: '5px', borderRadius: '50%',
                    background: i === 1 ? '#C4714A' : '#F5D6C4',
                    display: 'inline-block',
                  }} />
                ))}
              </div>

              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>
                Welcome back 👋
              </h1>
              <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: 0 }}>
                Sign in to your account
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Email */}
              <div>
                <label style={{
                  display: 'block', fontSize: '10.5px', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: '#64748b', marginBottom: '6px',
                }}>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                    color: '#94a3b8', display: 'flex',
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </span>
                  <input
                    className="login-input"
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      paddingLeft: '36px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px',
                      background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px',
                      color: '#1e293b', fontSize: '13px', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{
                  display: 'block', fontSize: '10.5px', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: '#64748b', marginBottom: '6px',
                }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', display: 'flex' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                  <input
                    className="login-input"
                    type={showPass ? 'text' : 'password'} required value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      paddingLeft: '36px', paddingRight: '42px', paddingTop: '10px', paddingBottom: '10px',
                      background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px',
                      color: '#1e293b', fontSize: '13px', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{
                    position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: '2px',
                  }}>
                    {showPass
                      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>


              <button
                type="submit" disabled={loading}
                style={{
                  width: '100%', padding: '12px',
                  background: loading
                    ? '#D4916A'
                    : 'linear-gradient(135deg, #C4714A 0%, #D4895A 100%)',
                  color: 'white', fontWeight: 700, fontSize: '14px',
                  border: 'none', borderRadius: '10px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 4px 20px rgba(196,113,74,0.35)',
                  transition: 'all 0.15s', letterSpacing: '0.02em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  opacity: loading ? 0.8 : 1,
                  marginTop: '4px',
                }}
              >
                {loading
                  ? <><Spinner /> Signing in…</>
                  : <>Sign In <span style={{ fontSize: '16px' }}>→</span></>
                }
              </button>
            </form>

            {/* Footer */}
            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <div style={{
                width: '100%', height: '1px',
                background: 'linear-gradient(90deg, transparent, #E2E8F0, transparent)',
                marginBottom: '1rem',
              }} />
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                <span style={{ color: '#C4714A', fontWeight: 600, letterSpacing: '0.05em' }}>Manpur Petrol Pump Task Manager</span>
                <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
                <span style={{ color: '#94a3b8' }}>Grow Your Business</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}

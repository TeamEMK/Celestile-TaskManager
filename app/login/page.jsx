'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setError('Invalid email or password');
    else window.location.href = '/';
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      background: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(220,38,38,0.08) 0%, #0a0a0c 65%)',
      backgroundColor: '#0a0a0c',
    }}>
      <div style={{ width: '100%', maxWidth: '22rem' }}>

        {/* Card */}
        <div style={{
          background: '#111115',
          border: '1px solid #27272a',
          borderRadius: '1.25rem',
          padding: '2rem',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.02)',
        }}>

          {/* Logo + Brand */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: '88px',
              height: '88px',
              margin: '0 auto 1.25rem',
              borderRadius: '1rem',
              overflow: 'hidden',
              background: '#ffffff',
              border: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <img
                src="/logo.png"
                alt="India Automotive"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.parentElement.style.background = '#dc2626';
                  e.target.parentElement.innerHTML = '<span style="color:white;font-size:22px;font-weight:900;letter-spacing:-1px">IA</span>';
                }}
              />
            </div>

            <div style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#dc2626',
              marginBottom: '6px',
            }}>
              INDIA AUTOMOTIVE
            </div>

            <div style={{
              width: '32px',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, #3f3f46, transparent)',
              margin: '0 auto 14px',
            }} />

            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#f4f4f5', margin: 0 }}>
              Welcome back
            </h1>
            <p style={{ fontSize: '12.5px', color: '#71717a', marginTop: '4px' }}>
              Sign in to your workspace
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Email */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#71717a',
                marginBottom: '6px',
              }}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)',
                  color: '#52525b', display: 'flex',
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                </span>
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    paddingLeft: '34px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px',
                    background: '#0e0e11', border: '1px solid #27272a', borderRadius: '8px',
                    color: '#e4e4e7', fontSize: '13px',
                    outline: 'none', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#dc2626'}
                  onBlur={e => e.target.style.borderColor = '#27272a'}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#71717a',
                marginBottom: '6px',
              }}>Password</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)',
                  color: '#52525b', display: 'flex',
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    paddingLeft: '34px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px',
                    background: '#0e0e11', border: '1px solid #27272a', borderRadius: '8px',
                    color: '#e4e4e7', fontSize: '13px',
                    outline: 'none', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#dc2626'}
                  onBlur={e => e.target.style.borderColor = '#27272a'}
                />
              </div>
            </div>

            {error && (
              <p style={{ color: '#f87171', fontSize: '12px', textAlign: 'center', margin: 0 }}>{error}</p>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '11px',
                background: loading ? '#7f1d1d' : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                color: 'white', fontWeight: 600, fontSize: '13.5px',
                border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(220,38,38,0.3)',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Signing in…' : <>Sign In <span style={{ fontSize: '15px' }}>→</span></>}
            </button>
          </form>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <div style={{
              width: '100%', height: '1px',
              background: 'linear-gradient(90deg, transparent, #27272a, transparent)',
              marginBottom: '1rem',
            }} />
            <p style={{ fontSize: '11px', color: '#52525b', margin: 0 }}>
              <span style={{ color: '#a1a1aa', fontWeight: 600, letterSpacing: '0.06em' }}>INDIA AUTOMOTIVE</span>
              <span style={{ margin: '0 8px', color: '#3f3f46' }}>·</span>
              Task Management System
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

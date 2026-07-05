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

  function showToast(msg, type = 'error') { setToast({ msg, type }); }

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
        @keyframes lx-float { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-12px) rotate(1.5deg); } }
        @keyframes lx-up { from { opacity:0; transform: translateY(22px); } to { opacity:1; transform: translateY(0); } }
        @keyframes lx-toast { from { opacity:0; transform: translateX(-50%) translateY(-18px) scale(.96); } to { opacity:1; transform: translateX(-50%) translateY(0) scale(1); } }
        @keyframes lx-spin { to { transform: rotate(360deg); } }
        @keyframes lx-drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(60px,-40px) scale(1.15); } }
        @keyframes lx-drift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-50px,40px) scale(1.2); } }
        @keyframes lx-drift3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,50px) scale(1.1); } }
        @keyframes lx-ring { 0%,100% { box-shadow: 0 0 0 1px rgba(232,184,115,.5), 0 0 40px rgba(232,184,115,.25); } 50% { box-shadow: 0 0 0 1px rgba(232,184,115,.8), 0 0 70px rgba(232,184,115,.45); } }
        @keyframes lx-shine { 0% { left:-120%; } 60%,100% { left:120%; } }
        @keyframes lx-sheen { to { background-position: 200% center; } }

        .lx-blob { position:absolute; border-radius:50%; filter: blur(70px); opacity:.55; pointer-events:none; }
        .lx-stagger > * { opacity:0; animation: lx-up .7s cubic-bezier(.16,1,.3,1) forwards; }
        .lx-stagger > *:nth-child(1){ animation-delay:.05s } .lx-stagger > *:nth-child(2){ animation-delay:.12s }
        .lx-stagger > *:nth-child(3){ animation-delay:.19s } .lx-stagger > *:nth-child(4){ animation-delay:.26s }
        .lx-stagger > *:nth-child(5){ animation-delay:.33s } .lx-stagger > *:nth-child(6){ animation-delay:.40s }

        .lx-input { width:100%; box-sizing:border-box; padding:13px 44px 13px 42px;
          background: rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.10); border-radius:13px;
          color:#f4ece0; font-size:13.5px; outline:none; transition: border-color .18s, box-shadow .18s, background .18s; }
        .lx-input::placeholder { color:#7c7468; }
        .lx-input:focus { border-color: rgba(232,184,115,.65); background: rgba(255,255,255,.06);
          box-shadow: 0 0 0 3px rgba(232,184,115,.14); }

        .lx-btn { position:relative; overflow:hidden; width:100%; padding:13.5px; border:none; border-radius:13px;
          color:#1a130a; font-weight:800; font-size:14px; letter-spacing:.02em; cursor:pointer;
          background: linear-gradient(135deg,#F5D6A8 0%,#E8B873 45%,#C4714A 100%);
          box-shadow: 0 10px 30px rgba(196,113,74,.40), inset 0 1px 0 rgba(255,255,255,.45);
          transition: transform .15s, box-shadow .2s, filter .2s;
          display:flex; align-items:center; justify-content:center; gap:9px; }
        .lx-btn:hover:not(:disabled) { transform: translateY(-2px); filter:brightness(1.04); box-shadow:0 16px 40px rgba(196,113,74,.5), inset 0 1px 0 rgba(255,255,255,.5); }
        .lx-btn:active:not(:disabled){ transform: translateY(0); }
        .lx-btn:disabled { cursor:not-allowed; opacity:.75; }
        .lx-btn::after { content:''; position:absolute; top:0; left:-120%; width:55%; height:100%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.55), transparent); transform: skewX(-20deg); }
        .lx-btn:not(:disabled)::after { animation: lx-shine 3.2s ease-in-out infinite; }

        .lx-eye { position:absolute; right:13px; top:50%; transform:translateY(-50%); background:none; border:none;
          cursor:pointer; color:#8a8175; display:flex; padding:3px; transition:color .15s; }
        .lx-eye:hover { color:#E8B873; }

        .lx-shell { position:relative; z-index:2; display:grid; grid-template-columns: 1.05fr .95fr;
          width:100%; max-width:920px; border-radius:26px; overflow:hidden;
          background: rgba(20,17,14,.55); backdrop-filter: blur(22px) saturate(140%); -webkit-backdrop-filter: blur(22px) saturate(140%);
          border:1px solid rgba(255,255,255,.10);
          box-shadow: 0 40px 120px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08);
          animation: lx-up .6s cubic-bezier(.16,1,.3,1) both; }

        .lx-brand { position:relative; padding:48px 44px; display:flex; flex-direction:column; justify-content:space-between;
          background:
            radial-gradient(circle at 80% 0%, rgba(232,184,115,.18), transparent 55%),
            radial-gradient(circle at 0% 100%, rgba(196,113,74,.20), transparent 55%),
            linear-gradient(160deg, rgba(255,255,255,.05), rgba(255,255,255,.01));
          border-right:1px solid rgba(255,255,255,.08); }
        .lx-feat { display:flex; align-items:center; gap:11px; font-size:13px; color:#cfc4b4; }
        .lx-feat svg { color:#E8B873; flex:none; }

        .lx-mini { display:none; }

        @media (max-width: 860px) {
          .lx-shell { grid-template-columns: 1fr; max-width:420px; }
          .lx-brand { display:none; }
          .lx-mini { display:flex; }
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '24px', left: '50%', zIndex: 9999,
          animation: 'lx-toast .35s cubic-bezier(.16,1,.3,1) both',
          background: toast.type === 'success' ? 'rgba(16,32,18,.92)' : 'rgba(38,18,18,.92)',
          backdropFilter: 'blur(10px)',
          color: toast.type === 'success' ? '#6ee7a0' : '#fb8585',
          padding: '12px 22px', borderRadius: '13px', fontSize: '13px', fontWeight: 600,
          boxShadow: '0 12px 40px rgba(0,0,0,.4)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(110,231,160,.25)' : 'rgba(251,133,133,.25)'}`,
          whiteSpace: 'nowrap',
        }}>{toast.msg}</div>
      )}

      <div style={{
        position: 'relative', minHeight: '100vh', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        background: 'radial-gradient(ellipse at 70% 20%, #1b1610 0%, #0d0b09 45%, #070605 100%)',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        {/* aurora orbs */}
        <div className="lx-blob" style={{ width: 480, height: 480, top: '-120px', left: '-80px', background: 'radial-gradient(circle,#E8B873,#C4714A)', animation: 'lx-drift1 16s ease-in-out infinite' }} />
        <div className="lx-blob" style={{ width: 420, height: 420, bottom: '-140px', right: '-60px', background: 'radial-gradient(circle,#C4714A,#7a3f24)', animation: 'lx-drift2 19s ease-in-out infinite' }} />
        <div className="lx-blob" style={{ width: 300, height: 300, top: '40%', left: '45%', opacity: .35, background: 'radial-gradient(circle,#F5D6A8,transparent)', animation: 'lx-drift3 22s ease-in-out infinite' }} />

        <div className="lx-shell">

          {/* ── Brand panel (desktop) — logo + name, centered ── */}
          <aside className="lx-brand lx-stagger" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="login-logo" style={{
                width: 116, height: 116, borderRadius: 26, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#0c0a08', animation: 'lx-float 5s ease-in-out infinite, lx-ring 4s ease-in-out infinite',
              }}>
                <img src="/logo.jpeg" alt="Celestile-TaskManager" width={116} height={116}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>

            <div className="font-display" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '.01em', color: '#F5E4C3' }}>
              Celestile
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.28em', textTransform: 'uppercase', color: '#9b9082', marginTop: -8 }}>
              Task Manager
            </div>
          </aside>

          {/* ── Form panel ── */}
          <main style={{ padding: '46px 40px' }}>
            <div className="lx-stagger" style={{ maxWidth: 340, margin: '0 auto' }}>

              {/* mini logo (mobile only) */}
              <div className="lx-mini" style={{ justifyContent: 'center', marginBottom: 20 }}>
                <div className="login-logo" style={{
                  width: 76, height: 76, borderRadius: 18, overflow: 'hidden', background: '#0c0a08',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: 'lx-float 5s ease-in-out infinite, lx-ring 4s ease-in-out infinite',
                }}>
                  <img src="/logo.jpeg" alt="Celestile-TaskManager" width={76} height={76} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>

              <div>
                <h1 className="font-display" style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 600, color: '#f6efe4' }}>Welcome back 👋</h1>
                <p style={{ margin: '0 0 26px', fontSize: 13, color: '#9b9082' }}>Sign in to your Celestile workspace</p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Email */}
                <div>
                  <label style={lblStyle}>Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <span style={iconStyle}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                    </span>
                    <input className="lx-input" type="email" required value={email}
                      onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label style={lblStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={iconStyle}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    </span>
                    <input className="lx-input" type={showPass ? 'text' : 'password'} required value={password}
                      onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                    <button type="button" className="lx-eye" onClick={() => setShowPass(v => !v)} aria-label="Toggle password">
                      {showPass
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading} className="lx-btn" style={{ marginTop: 4 }}>
                  {loading ? <><Spinner /> Signing in…</> : <>Sign In <span style={{ fontSize: 16 }}>→</span></>}
                </button>
              </form>

              <div style={{ marginTop: 26 }}>
                <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent)', marginBottom: 14 }} />
                <p style={{ textAlign: 'center', fontSize: 11, color: '#8a8175', margin: 0, letterSpacing: '.03em' }}>
                  <span style={{ color: '#E8B873', fontWeight: 700 }}>Celestile-TaskManager</span>
                  <span style={{ margin: '0 7px', color: '#56504a' }}>·</span>
                  Grow Your Business
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

const lblStyle = {
  display: 'block', fontSize: 10.5, fontWeight: 600, letterSpacing: '.09em',
  textTransform: 'uppercase', color: '#9b9082', marginBottom: 7,
};
const iconStyle = {
  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
  color: '#8a8175', display: 'flex',
};

function Spinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'lx-spin .7s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

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
      showToast('Invalid email or password ', 'error');
    } else {
      showToast('Login successful! Redirecting… ', 'success');
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
        @keyframes lx-ring { 0%,100% { box-shadow: 0 0 0 1px rgba(238,188,46,.5), 0 0 40px rgba(238,188,46,.25); } 50% { box-shadow: 0 0 0 1px rgba(238,188,46,.8), 0 0 70px rgba(238,188,46,.45); } }
        @keyframes lx-shine { 0% { left:-120%; } 60%,100% { left:120%; } }
        @keyframes lx-sheen { to { background-position: 200% center; } }

        /* The medallion carves itself: every path starts fully dashed out and
           is drawn in, in the order the machine would cut it. */
        @keyframes lx-carve { to { stroke-dashoffset: 0; } }
        @keyframes lx-turn  { to { transform: rotate(360deg); } }
        @keyframes lx-vein  { 0%,100% { transform: translate3d(0,0,0) scale(1); opacity:.30; }
                              50%     { transform: translate3d(-24px,18px,0) scale(1.06); opacity:.45; } }
        @keyframes lx-fadein { to { opacity: 1; } }

        .lx-medallion { position:absolute; inset:0; display:grid; place-items:center;
          pointer-events:none; z-index:0; opacity:0; animation: lx-fadein 1.2s ease .2s forwards; }
        .lx-medallion svg { width:min(88vh, 780px); height:min(88vh, 780px); overflow:visible; }
        .lx-cut { stroke-dasharray: 1; stroke-dashoffset: 1;
          animation: lx-carve 1.6s cubic-bezier(.22,1,.36,1) forwards; }
        /* One very slow turn, so the pattern is never quite where you left it. */
        .lx-turn { transform-origin: 0 0; animation: lx-turn 240s linear infinite; }
        .lx-shine-layer { opacity:.9; }

        /* Marble veining drifting behind the whole thing. */
        .lx-vein { position:absolute; inset:-20%; pointer-events:none; z-index:0; opacity:.3;
          background:
            repeating-linear-gradient(112deg, transparent 0 68px, rgba(238,188,46,.14) 68px 69px, transparent 69px 150px),
            repeating-linear-gradient(64deg,  transparent 0 96px, rgba(255,255,255,.05) 96px 97px, transparent 97px 210px);
          filter: blur(.4px); animation: lx-vein 26s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .lx-cut { animation: none; stroke-dashoffset: 0; }
          .lx-turn, .lx-vein, .lx-medallion { animation: none; opacity: 1; }
        }
        @media (max-width: 860px) { .lx-medallion svg { width:min(70vh, 460px); height:min(70vh, 460px); } }

        .lx-blob { position:absolute; border-radius:50%; filter: blur(70px); opacity:.55; pointer-events:none; }
        .lx-stagger > * { opacity:0; animation: lx-up .7s cubic-bezier(.16,1,.3,1) forwards; }
        .lx-stagger > *:nth-child(1){ animation-delay:.05s } .lx-stagger > *:nth-child(2){ animation-delay:.12s }
        .lx-stagger > *:nth-child(3){ animation-delay:.19s } .lx-stagger > *:nth-child(4){ animation-delay:.26s }
        .lx-stagger > *:nth-child(5){ animation-delay:.33s } .lx-stagger > *:nth-child(6){ animation-delay:.40s }

        .lx-input { width:100%; box-sizing:border-box; padding:14px 46px 14px 44px;
          background: rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.10); border-radius:13px;
          color:#F5F5F5; font-size:15px; outline:none; transition: border-color .18s, box-shadow .18s, background .18s; }
        .lx-input::placeholder { color:#737373; }
        .lx-input:focus { border-color: rgba(238,188,46,.65); background: rgba(255,255,255,.06);
          box-shadow: 0 0 0 3px rgba(238,188,46,.14); }

        .lx-btn { position:relative; overflow:hidden; width:100%; padding:14px; border:none; border-radius:13px;
          color:#000000; font-weight:800; font-size:15px; letter-spacing:.02em; cursor:pointer;
          background: linear-gradient(135deg,#F3C955 0%,#EEBC2E 45%,#B78A16 100%);
          box-shadow: 0 10px 30px rgba(183,138,22,.40), inset 0 1px 0 rgba(255,255,255,.45);
          transition: transform .15s, box-shadow .2s, filter .2s;
          display:flex; align-items:center; justify-content:center; gap:9px; }
        .lx-btn:hover:not(:disabled) { transform: translateY(-2px); filter:brightness(1.04); box-shadow:0 16px 40px rgba(183,138,22,.5), inset 0 1px 0 rgba(255,255,255,.5); }
        .lx-btn:active:not(:disabled){ transform: translateY(0); }
        .lx-btn:disabled { cursor:not-allowed; opacity:.75; }
        .lx-btn::after { content:''; position:absolute; top:0; left:-120%; width:55%; height:100%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.55), transparent); transform: skewX(-20deg); }
        .lx-btn:not(:disabled)::after { animation: lx-shine 3.2s ease-in-out infinite; }

        .lx-eye { position:absolute; right:13px; top:50%; transform:translateY(-50%); background:none; border:none;
          cursor:pointer; color:#71717A; display:flex; padding:3px; transition:color .15s; }
        .lx-eye:hover { color:#EEBC2E; }

        .lx-shell { position:relative; z-index:2; display:grid; grid-template-columns: 1.05fr .95fr;
          width:100%; max-width:920px; border-radius:26px; overflow:hidden;
          background: rgba(17,17,17,.55); backdrop-filter: blur(22px) saturate(140%); -webkit-backdrop-filter: blur(22px) saturate(140%);
          border:1px solid rgba(255,255,255,.10);
          box-shadow: 0 40px 120px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08);
          animation: lx-up .6s cubic-bezier(.16,1,.3,1) both; }

        .lx-brand { position:relative; padding:48px 44px; display:flex; flex-direction:column; justify-content:space-between;
          background:
            radial-gradient(circle at 80% 0%, rgba(238,188,46,.18), transparent 55%),
            radial-gradient(circle at 0% 100%, rgba(183,138,22,.20), transparent 55%),
            linear-gradient(160deg, rgba(255,255,255,.05), rgba(255,255,255,.01));
          border-right:1px solid rgba(255,255,255,.08); }
        .lx-feat { display:flex; align-items:center; gap:11px; font-size:14px; color:#D4D4D4; }
        .lx-feat svg { color:#EEBC2E; flex:none; }

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
          padding: '12px 22px', borderRadius: '13px', fontSize: '14px', fontWeight: 600,
          boxShadow: '0 12px 40px rgba(0,0,0,.4)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(110,231,160,.25)' : 'rgba(251,133,133,.25)'}`,
          whiteSpace: 'nowrap',
        }}>{toast.msg}</div>
      )}

      <div style={{
        position: 'relative', minHeight: '100vh', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        background: 'radial-gradient(ellipse at 70% 20%, #171717 0%, #0D0D0D 45%, #000000 100%)',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        {/* Backdrop: marble veining, and an inlay medallion that carves
            itself in the way the CNC floor actually cuts one. */}
        <div className="lx-vein" />
        <InlayMedallion />
        {/* One soft glow is kept for depth behind the card. */}
        <div className="lx-blob" style={{ width: 520, height: 520, top: '-140px', left: '-100px', opacity: .28, background: 'radial-gradient(circle,#B78A16,transparent 70%)', animation: 'lx-drift1 22s ease-in-out infinite' }} />

        <div className="lx-shell">

          {/* ── Brand panel (desktop) — logo + name, centered ── */}
          <aside className="lx-brand lx-stagger" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="login-logo" style={{
                width: 116, height: 116, borderRadius: 26, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#0A0A0A', animation: 'lx-float 5s ease-in-out infinite, lx-ring 4s ease-in-out infinite',
              }}>
                <img src="/logo.jpeg" alt="Celestile-TaskManager" width={116} height={116}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>

            <div className="font-display" style={{ fontSize: 24, fontWeight: 600, letterSpacing: '.01em', color: '#FBEAB8' }}>
              Celestile
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.28em', textTransform: 'uppercase', color: '#9CA3AF', marginTop: -8 }}>
              Task Manager
            </div>
          </aside>

          {/* ── Form panel ── */}
          <main style={{ padding: '46px 40px' }}>
            <div className="lx-stagger" style={{ maxWidth: 340, margin: '0 auto' }}>

              {/* mini logo (mobile only) */}
              <div className="lx-mini" style={{ justifyContent: 'center', marginBottom: 20 }}>
                <div className="login-logo" style={{
                  width: 76, height: 76, borderRadius: 18, overflow: 'hidden', background: '#0A0A0A',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: 'lx-float 5s ease-in-out infinite, lx-ring 4s ease-in-out infinite',
                }}>
                  <img src="/logo.jpeg" alt="Celestile-TaskManager" width={76} height={76} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>

              <div>
                <h1 className="font-display" style={{ margin: '0 0 6px', fontSize: 30, fontWeight: 600, color: '#FAFAFA' }}>Welcome back </h1>
                <p style={{ margin: '0 0 26px', fontSize: 14, color: '#9CA3AF' }}>Sign in to your Celestile workspace</p>
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
                <p style={{ textAlign: 'center', fontSize: 12, color: '#71717A', margin: 0, letterSpacing: '.03em' }}>
                  <span style={{ color: '#EEBC2E', fontWeight: 700 }}>Celestile-TaskManager</span>
                  <span style={{ margin: '0 7px', color: '#525252' }}>·</span>
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
  display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.09em',
  textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 7,
};
const iconStyle = {
  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
  color: '#71717A', display: 'flex',
};

function Spinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'lx-spin .7s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/* ── Inlay medallion ────────────────────────────────────────────────────
   The login backdrop, and the one thing on this screen that is actually about
   Celestile: an inlay pattern carving itself into stone.

   It is drawn the way the floor makes it — the CNC cuts the outline first,
   then the petals, then the fill lines — by animating stroke-dashoffset on
   each path in that order. Once cut, a polish sweep passes across it, the way
   light moves over a finished slab. `pathLength="1"` normalises every path so
   one timing works regardless of how long the geometry actually is.

   Purely decorative: aria-hidden, and it holds still for anyone who asked for
   reduced motion. */
function InlayMedallion() {
  const RING = '#EEBC2E';
  const petal = 'M 0 -46 C 30 -76, 30 -116, 0 -150 C -30 -116, -30 -76, 0 -46 Z';
  const leaf  = 'M 0 -30 C 16 -48, 16 -70, 0 -88 C -16 -70, -16 -48, 0 -30 Z';

  return (
    <div className="lx-medallion" aria-hidden="true">
      <svg viewBox="-200 -200 400 400" width="100%" height="100%">
        <defs>
          <linearGradient id="lx-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#F7DA85" />
            <stop offset="45%"  stopColor="#EEBC2E" />
            <stop offset="100%" stopColor="#8F6B10" />
          </linearGradient>
          {/* The polish sweep: a narrow bright band that travels across the
              pattern, brightening only what it is over. */}
          <linearGradient id="lx-polish" x1="-1" y1="0" x2="0" y2="0">
            <stop offset="0%"   stopColor="#fff" stopOpacity="0" />
            <stop offset="50%"  stopColor="#fff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            <animate attributeName="x1" values="-1;1.6" dur="7s" begin="4.5s" repeatCount="indefinite" />
            <animate attributeName="x2" values="0;2.6"  dur="7s" begin="4.5s" repeatCount="indefinite" />
          </linearGradient>
          <mask id="lx-sweep">
            <rect x="-200" y="-200" width="400" height="400" fill="url(#lx-polish)" />
          </mask>
        </defs>

        <g className="lx-turn" fill="none" stroke="url(#lx-gold)" strokeLinecap="round" strokeLinejoin="round">
          {/* 1 — the outline the machine cuts first */}
          <circle className="lx-cut" style={{ animationDelay: '0.1s' }} pathLength="1" r="176" strokeWidth="1" opacity=".5" />
          <circle className="lx-cut" style={{ animationDelay: '0.3s' }} pathLength="1" r="164" strokeWidth="2" />

          {/* 2 — eight petals, each starting a beat after the last */}
          {Array.from({ length: 8 }, (_, i) => (
            <path key={`p${i}`} className="lx-cut" pathLength="1" d={petal} strokeWidth="1.6"
              transform={`rotate(${i * 45})`} style={{ animationDelay: `${0.6 + i * 0.09}s` }} />
          ))}

          {/* 3 — the inner leaves, offset between the petals */}
          {Array.from({ length: 8 }, (_, i) => (
            <path key={`l${i}`} className="lx-cut" pathLength="1" d={leaf} strokeWidth="1.2" opacity=".8"
              transform={`rotate(${i * 45 + 22.5})`} style={{ animationDelay: `${1.5 + i * 0.06}s` }} />
          ))}

          {/* 4 — the fill ticks around the rim */}
          {Array.from({ length: 32 }, (_, i) => (
            <line key={`t${i}`} className="lx-cut" pathLength="1" x1="0" y1="-166" x2="0" y2="-176"
              strokeWidth="1" opacity=".65" transform={`rotate(${i * 11.25})`}
              style={{ animationDelay: `${2.2 + i * 0.02}s` }} />
          ))}

          {/* 5 — the centre rosette, set last, the way the stone is */}
          <circle className="lx-cut" style={{ animationDelay: '2.9s' }} pathLength="1" r="34" strokeWidth="1.6" />
          <circle className="lx-cut" style={{ animationDelay: '3.1s' }} pathLength="1" r="16" strokeWidth="1.2" opacity=".8" />
        </g>

        {/* The same pattern again, painted white and revealed only through the
            travelling band — that is the polish catching the light. */}
        <g className="lx-turn lx-shine-layer" fill="none" stroke="#FFF6DA" strokeLinecap="round"
          strokeLinejoin="round" mask="url(#lx-sweep)">
          <circle r="164" strokeWidth="2" />
          {Array.from({ length: 8 }, (_, i) => (
            <path key={`sp${i}`} d={petal} strokeWidth="1.6" transform={`rotate(${i * 45})`} />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <path key={`sl${i}`} d={leaf} strokeWidth="1.2" transform={`rotate(${i * 45 + 22.5})`} />
          ))}
          <circle r="34" strokeWidth="1.6" />
        </g>
      </svg>
    </div>
  );
}

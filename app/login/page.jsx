'use client';
import { useState, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';

/* Moods the buddy can be in. Everything on the page — eyes, mouth, arms,
   the speech bubble — is driven off this one value. */
const QUIPS = {
  idle:    ['Ready when you are.', 'I counted 4,812 tiles today. Alone.', 'Nice mouse moves.', 'I have been standing here since morning.'],
  typing:  ['Ooh, big words.', 'Very professional email.', 'Spelling looks… confident.', 'Go on, I am reading.'],
  hiding:  ['Eyes shut. Pinky promise.', 'I see nothing. NOTHING.', 'Type freely, I am basically a wall.', 'Not looking. Definitely not looking.'],
  peek:    ['…okay, maybe one eye.', 'You clicked show. That is on you.', 'Ohh, THAT is your password?', 'I am not judging. Much.'],
  loading: ['Asking the boss…', 'Running to the server…', 'One second, checking the register…'],
  happy:   ['LETS GOOO!', 'Knew it was you!', 'Doors open, boss.'],
  sad:     ['Nope. Confidently wrong.', 'That was… not it.', 'Try the other one. You know the one.'],
  poke:    ['Ow. Rude.', 'Poke me again and I tell HR.', 'I am load-bearing, you know.'],
};

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [toast,    setToast]    = useState(null); // { msg, type }
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [mood,  setMood]  = useState('idle');
  const [quip,  setQuip]  = useState('Ready when you are.');
  const [shake, setShake] = useState(false);
  const [party, setParty] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const pokeTimer = useRef(null);

  // The bubble line is picked at random, so it must never run during render —
  // the server would pick a different one and hydration would complain.
  function setMoodAndQuip(next) {
    setMood(next);
    const lines = QUIPS[next] || QUIPS.idle;
    setQuip(lines[Math.floor(Math.random() * lines.length)]);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => () => clearTimeout(pokeTimer.current), []);

  function showToast(msg, type = 'error') { setToast({ msg, type }); }

  function poke() {
    if (loading) return;
    clearTimeout(pokeTimer.current);
    setMoodAndQuip('poke');
    pokeTimer.current = setTimeout(() => setMoodAndQuip('idle'), 1100);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setToast(null); setMoodAndQuip('loading');
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setMoodAndQuip('sad');
      setShake(true); setTimeout(() => setShake(false), 620);
      showToast('Invalid email or password ', 'error');
      setTimeout(() => setMoodAndQuip('idle'), 2600);
    } else {
      setMoodAndQuip('happy');
      setParty(true);
      showToast('Login successful! Redirecting… ', 'success');
      setTimeout(() => { window.location.href = '/'; }, 1400);
    }
  }

  // What the password box does to the buddy: hands up, or hands up with a gap.
  function onPassFocus() { setMoodAndQuip(showPass ? 'peek' : 'hiding'); }
  function onPassBlur()  { if (!loading) setMoodAndQuip('idle'); }
  function togglePass() {
    const next = !showPass;
    setShowPass(next);
    if (mood === 'hiding' || mood === 'peek') setMoodAndQuip(next ? 'peek' : 'hiding');
  }

  const buddyProps = { mood, emailFocus, emailLen: email.length, onPoke: poke };

  return (
    <>
      <style>{`
        @keyframes lx-up { from { opacity:0; transform: translateY(22px); } to { opacity:1; transform: translateY(0); } }
        @keyframes lx-toast { from { opacity:0; transform: translateX(-50%) translateY(-18px) scale(.96); } to { opacity:1; transform: translateX(-50%) translateY(0) scale(1); } }
        @keyframes lx-spin { to { transform: rotate(360deg); } }
        @keyframes lx-drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(60px,-40px) scale(1.15); } }
        @keyframes lx-shine { 0% { left:-120%; } 60%,100% { left:120%; } }
        @keyframes lx-fadein { to { opacity: 1; } }
        @keyframes lx-shake { 10%,90% { transform: translateX(-3px) rotate(-.4deg); }
                              20%,80% { transform: translateX(5px)  rotate(.5deg); }
                              30%,50%,70% { transform: translateX(-8px) rotate(-.7deg); }
                              40%,60% { transform: translateX(8px)  rotate(.7deg); } }
        .lx-shake { animation: lx-shake .6s cubic-bezier(.36,.07,.19,.97) both; }

        /* ── The buddy ─────────────────────────────────────────────── */
        @keyframes lb-idle    { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-7px) rotate(-1.2deg); } }
        @keyframes lb-hop     { 0%,100% { transform: translateY(0) scaleY(1); }
                                30%     { transform: translateY(-22px) scaleY(1.06); }
                                55%     { transform: translateY(0) scaleY(.9); }
                                75%     { transform: translateY(-9px) scaleY(1.02); } }
        @keyframes lb-mope    { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(5px) rotate(0deg); } }
        @keyframes lb-squish  { 0%,100% { transform: scale(1,1); } 40% { transform: scale(1.14,.84); } 70% { transform: scale(.94,1.07); } }
        @keyframes lb-antenna { 0%,100% { transform: rotate(-13deg); } 50% { transform: rotate(13deg); } }
        @keyframes lb-buzz    { to { transform: rotate(360deg); } }
        @keyframes lb-blink   { 0%,94%,100% { transform: scaleY(0); } 96%,98% { transform: scaleY(1); } }
        @keyframes lb-sweat   { 0%   { opacity:0; transform: translate(0,0) scale(.4); }
                                25%  { opacity:.95; }
                                100% { opacity:0; transform: translate(6px,26px) scale(1); } }
        @keyframes lb-note    { 0%   { opacity:0; transform: translate(0,0) rotate(0deg) scale(.5); }
                                20%  { opacity:1; }
                                100% { opacity:0; transform: translate(16px,-34px) rotate(24deg) scale(1); } }

        .lb-wrap   { cursor:pointer; -webkit-tap-highlight-color:transparent; user-select:none; }
        .lb-body   { transform-box: fill-box; transform-origin: 50% 100%; animation: lb-idle 4.2s ease-in-out infinite; }
        .lb-happy  { animation: lb-hop .8s cubic-bezier(.3,1.4,.5,1) 2; }
        .lb-sad    { animation: lb-mope 1.6s ease-in-out infinite; }
        .lb-poke   { animation: lb-squish .5s cubic-bezier(.3,1.5,.5,1) 1; }
        .lb-ant    { transform-box: fill-box; transform-origin: 50% 100%; animation: lb-antenna 2.4s ease-in-out infinite; }
        .lb-ant-fast { animation: lb-buzz .5s linear infinite; }
        .lb-lid    { transform-box: fill-box; transform-origin: 50% 0%; transform: scaleY(0);
                     animation: lb-blink 5.4s ease-in-out infinite; }
        .lb-lid-b  { animation-delay: .06s; }
        .lb-squint { animation: none !important; transform: scaleY(.55) !important; }
        .lb-arm    { transition: transform .42s cubic-bezier(.34,1.56,.64,1); }
        .lb-pupil  { transition: transform .22s ease-out; }
        .lb-drop   { animation: lb-sweat 1.5s ease-in infinite; }
        .lb-note   { animation: lb-note 2.6s ease-out infinite; }

        .lx-bubble { position:relative; max-width:240px; margin:0 auto 8px; padding:10px 15px;
          background: rgba(238,188,46,.10); border:1px solid rgba(238,188,46,.30); border-radius:15px;
          color:#FBEAB8; font-size:13px; font-weight:600; line-height:1.35; text-align:center; }
        .lx-bubble::after { content:''; position:absolute; left:50%; bottom:-7px; width:12px; height:12px;
          margin-left:-6px; transform:rotate(45deg);
          background: rgba(238,188,46,.10); border-right:1px solid rgba(238,188,46,.30);
          border-bottom:1px solid rgba(238,188,46,.30); }

        /* Confetti for a password that works. */
        @keyframes lx-confetti { 0%   { opacity:1; transform: translate(0,0) rotate(0deg); }
                                 100% { opacity:0; transform: translate(var(--dx), 170px) rotate(var(--rot)); } }
        .lx-confetti { position:absolute; top:36%; left:50%; width:8px; height:12px;
          animation: lx-confetti 1.4s cubic-bezier(.2,.7,.4,1) forwards; pointer-events:none; }

        /* Tiles drifting through the stone behind everything. */
        @keyframes lx-tile { 0%,100% { transform: translate(0,0) rotate(var(--r)); }
                             50%     { transform: translate(var(--tx), var(--ty)) rotate(calc(var(--r) + 18deg)); } }
        .lx-tiles { position:absolute; inset:0; pointer-events:none; z-index:0;
          opacity:0; animation: lx-fadein 1.2s ease .2s forwards; }
        .lx-tile { position:absolute; border:1.5px solid rgba(238,188,46,.20); border-radius:8px;
          background: linear-gradient(140deg, rgba(238,188,46,.055), transparent 60%);
          animation: lx-tile var(--d) ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .lb-body, .lb-happy, .lb-sad, .lb-poke, .lb-ant, .lb-ant-fast, .lb-lid,
          .lb-drop, .lb-note, .lx-tile, .lx-shake, .lx-confetti { animation: none !important; }
        }

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
        .lx-arrow { display:inline-block; font-size:16px; transition: transform .22s cubic-bezier(.34,1.56,.64,1); }
        .lx-btn:hover:not(:disabled) .lx-arrow { transform: translateX(5px); }

        .lx-eye { position:absolute; right:13px; top:50%; transform:translateY(-50%); background:none; border:none;
          cursor:pointer; color:#71717A; display:flex; padding:3px; transition:color .15s; }
        .lx-eye:hover { color:#EEBC2E; }

        .lx-shell { position:relative; z-index:2; display:grid; grid-template-columns: 1.05fr .95fr;
          width:100%; max-width:920px; border-radius:26px; overflow:hidden;
          background: rgba(17,17,17,.55); backdrop-filter: blur(22px) saturate(140%); -webkit-backdrop-filter: blur(22px) saturate(140%);
          border:1px solid rgba(255,255,255,.10);
          box-shadow: 0 40px 120px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08);
          animation: lx-up .6s cubic-bezier(.16,1,.3,1) both; }

        .lx-brand { position:relative; padding:38px 34px; display:flex; flex-direction:column; justify-content:center;
          background:
            radial-gradient(circle at 80% 0%, rgba(238,188,46,.18), transparent 55%),
            radial-gradient(circle at 0% 100%, rgba(183,138,22,.20), transparent 55%),
            linear-gradient(160deg, rgba(255,255,255,.05), rgba(255,255,255,.01));
          border-right:1px solid rgba(255,255,255,.08); }

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
        <DriftingTiles />
        <div className="lx-blob" style={{ width: 520, height: 520, top: '-140px', left: '-100px', opacity: .28, background: 'radial-gradient(circle,#B78A16,transparent 70%)', animation: 'lx-drift1 22s ease-in-out infinite' }} />

        <div className={`lx-shell${shake ? ' lx-shake' : ''}`}>

          {/* ── Brand panel (desktop): the buddy is the whole show ── */}
          <aside className="lx-brand lx-stagger" style={{ alignItems: 'center', textAlign: 'center', gap: 12 }}>
            <div className="lx-bubble" key={quip}>{quip}</div>

            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
              <Buddy size={186} {...buddyProps} />
              {party && <Confetti />}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11 }}>
              <img src="/logo.jpeg" alt="Celestile-TaskManager" width={38} height={38}
                style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', background: '#0A0A0A' }} />
              <div style={{ textAlign: 'left' }}>
                <div className="font-display" style={{ fontSize: 21, fontWeight: 600, letterSpacing: '.01em', color: '#FBEAB8', lineHeight: 1.15 }}>
                  Celestile
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.26em', textTransform: 'uppercase', color: '#9CA3AF' }}>
                  Task Manager
                </div>
              </div>
            </div>
          </aside>

          {/* ── Form panel ── */}
          <main style={{ padding: '46px 40px' }}>
            <div className="lx-stagger" style={{ maxWidth: 340, margin: '0 auto' }}>

              {/* logo + buddy, mobile only */}
              <div className="lx-mini" style={{ justifyContent: 'center', alignItems: 'flex-end', gap: 10, marginBottom: 16 }}>
                <div className="login-logo" style={{
                  width: 62, height: 62, borderRadius: 15, overflow: 'hidden', background: '#0A0A0A',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6,
                }}>
                  <img src="/logo.jpeg" alt="Celestile-TaskManager" width={62} height={62} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <Buddy size={104} {...buddyProps} />
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
                      onFocus={() => { setEmailFocus(true); if (!loading) setMoodAndQuip('typing'); }}
                      onBlur={() => { setEmailFocus(false); if (!loading) setMoodAndQuip('idle'); }}
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
                      onFocus={onPassFocus} onBlur={onPassBlur}
                      onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                    <button type="button" className="lx-eye" onClick={togglePass} aria-label="Toggle password">
                      {showPass
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading} className="lx-btn" style={{ marginTop: 4 }}>
                  {loading ? <><Spinner /> Signing in…</> : <>Sign In <span className="lx-arrow">→</span></>}
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

/* ── Tilo, the tile buddy ────────────────────────────────────────────────
   A little gold-rimmed tile with arms. He follows the cursor, reads over
   your shoulder while you type your email, slaps both hands over his eyes
   the moment you touch the password box — and drops one hand to peek the
   second you hit "show". Wrong password and he mopes; right one and he
   jumps. Poke him and he squishes.

   All CSS transitions and keyframes. The only per-frame JavaScript is the
   pointer listener, and it writes straight to the pupils' transform instead
   of re-rendering React. */

const MOUTH = {
  idle:    { d: 'M 57 92 Q 70 103 83 92' },
  typing:  { d: 'M 57 91 Q 70 106 83 91' },
  hiding:  { d: 'M 63 93 a 7 7 0 1 0 14 0 a 7 7 0 1 0 -14 0', fill: '#EEBC2E', stroke: 'none' },
  peek:    { d: 'M 58 94 Q 69 102 80 89' },
  loading: { d: 'M 60 95 L 79 91' },
  happy:   { d: 'M 53 88 Q 70 113 87 88 Z', fill: '#EEBC2E', stroke: 'none' },
  sad:     { d: 'M 57 101 Q 70 88 83 101' },
  poke:    { d: 'M 62 91 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0', fill: '#EEBC2E', stroke: 'none' },
};

// Where each arm goes, per mood. Rest is down by his sides.
const ARMS = {
  hiding: ['translate(24px,-34px) rotate(-8deg)',  'translate(-24px,-34px) rotate(8deg)'],
  peek:   ['translate(24px,-34px) rotate(-8deg)',  'translate(-22px,-4px) rotate(26deg)'],
  happy:  ['translate(-6px,-46px) rotate(-34deg)', 'translate(6px,-46px) rotate(34deg)'],
  sad:    ['translate(6px,8px) rotate(12deg)',     'translate(-6px,8px) rotate(-12deg)'],
  poke:   ['translate(-10px,-12px) rotate(-22deg)','translate(10px,-12px) rotate(22deg)'],
};
const ARMS_REST = ['translate(0px,0px)', 'translate(0px,0px)'];

function Buddy({ size = 186, mood = 'idle', emailFocus = false, emailLen = 0, onPoke }) {
  const wrapRef  = useRef(null);
  const pupilRef = useRef(null);

  // While he is reading the email box or waiting on the server, the mood owns
  // the eyes — the pointer must not fight it.
  const locked =
    emailFocus            ? { x: -4.5 + Math.min(1, emailLen / 22) * 9, y: 3 }
    : mood === 'loading'  ? { x: 3, y: -3 }
    : mood === 'poke'     ? { x: 0, y: 0 }
    : null;

  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    if (locked && pupilRef.current) {
      pupilRef.current.style.transform = `translate(${locked.x}px, ${locked.y}px)`;
    }
  }, [locked && locked.x, locked && locked.y]);

  useEffect(() => {
    function onMove(e) {
      if (lockedRef.current || !pupilRef.current || !wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      const cx = Math.max(-1, Math.min(1, dx * 1.6)) * 5;
      const cy = Math.max(-1, Math.min(1, dy * 1.6)) * 4;
      pupilRef.current.style.transform = `translate(${cx}px, ${cy}px)`;
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const mouth = MOUTH[mood] || MOUTH.idle;
  const arms  = ARMS[mood]  || ARMS_REST;
  const bodyCls = 'lb-body'
    + (mood === 'happy' ? ' lb-happy' : '')
    + (mood === 'sad'   ? ' lb-sad'   : '')
    + (mood === 'poke'  ? ' lb-poke'  : '');
  const lidCls = 'lb-lid' + (mood === 'loading' ? ' lb-squint' : '');

  return (
    <div ref={wrapRef} className="lb-wrap" onClick={onPoke} aria-hidden="true"
      style={{ width: size, height: size * 0.94, display: 'flex', justifyContent: 'center', flex: 'none' }}>
      <svg viewBox="0 0 140 132" width="100%" height="100%" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="lb-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F7DA85" />
            <stop offset="55%" stopColor="#EEBC2E" />
            <stop offset="100%" stopColor="#B78A16" />
          </linearGradient>
          <linearGradient id="lb-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A1A1A" />
            <stop offset="100%" stopColor="#0B0B0B" />
          </linearGradient>
        </defs>

        {/* the floor he stands on */}
        <ellipse cx="70" cy="127" rx="38" ry="5" fill="#000000" opacity=".45" />

        <g className={bodyCls}>
          {/* antenna — it spins while the server is thinking */}
          <g className={`lb-ant${mood === 'loading' ? ' lb-ant-fast' : ''}`}>
            <path d="M 70 34 L 70 16" stroke="url(#lb-gold)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <circle cx="70" cy="12" r="6" fill="url(#lb-gold)" />
            <circle cx="68" cy="10" r="2" fill="#FFF6DA" opacity=".85" />
          </g>

          {/* feet */}
          <rect x="42" y="112" width="20" height="10" rx="5" fill="#141414" stroke="url(#lb-gold)" strokeWidth="2" />
          <rect x="78" y="112" width="20" height="10" rx="5" fill="#141414" stroke="url(#lb-gold)" strokeWidth="2" />

          {/* the tile itself */}
          <rect x="20" y="32" width="100" height="84" rx="26" fill="url(#lb-face)" stroke="url(#lb-gold)" strokeWidth="3" />
          <rect x="27" y="39" width="86" height="70" rx="21" fill="none" stroke="#EEBC2E" strokeOpacity=".16" strokeWidth="1.5" />

          {/* cheeks */}
          <ellipse cx="35" cy="88" rx="8" ry="5" fill="#EEBC2E" opacity={mood === 'happy' ? '.36' : '.16'} />
          <ellipse cx="105" cy="88" rx="8" ry="5" fill="#EEBC2E" opacity={mood === 'happy' ? '.36' : '.16'} />

          {/* ── eyes ── */}
          {mood === 'sad' ? (
            <g stroke="#F7DA85" strokeWidth="3.4" strokeLinecap="round">
              <path d="M 43 60 L 57 72 M 57 60 L 43 72" />
              <path d="M 83 60 L 97 72 M 97 60 L 83 72" />
            </g>
          ) : mood === 'happy' ? (
            <g stroke="#F7DA85" strokeWidth="3.6" strokeLinecap="round" fill="none">
              <path d="M 40 70 Q 50 56 60 70" />
              <path d="M 80 70 Q 90 56 100 70" />
            </g>
          ) : (
            <>
              <circle cx="50" cy="66" r="13" fill="#F6F1E4" />
              <circle cx="90" cy="66" r="13" fill="#F6F1E4" />
              <g ref={pupilRef} className="lb-pupil">
                <circle cx="50" cy="66" r={mood === 'poke' ? 7.5 : 6} fill="#0C0C0C" />
                <circle cx="90" cy="66" r={mood === 'poke' ? 7.5 : 6} fill="#0C0C0C" />
                <circle cx="47.4" cy="63" r="2.1" fill="#FFFFFF" opacity=".9" />
                <circle cx="87.4" cy="63" r="2.1" fill="#FFFFFF" opacity=".9" />
              </g>
              {/* lids: they drop for a blink, and stay half-down while he squints */}
              <rect className={lidCls} x="37" y="53" width="26" height="27" rx="13" fill="url(#lb-face)" />
              <rect className={`${lidCls} lb-lid-b`} x="77" y="53" width="26" height="27" rx="13" fill="url(#lb-face)" />
              {/* one raised eyebrow while he peeks */}
              {mood === 'peek' && (
                <path d="M 80 47 Q 90 41 100 46" stroke="#F7DA85" strokeWidth="3" strokeLinecap="round" fill="none" />
              )}
            </>
          )}

          {/* ── mouth ── */}
          <path d={mouth.d} fill={mouth.fill || 'none'}
            stroke={mouth.stroke === 'none' ? 'none' : '#F7DA85'}
            strokeWidth="3.4" strokeLinecap="round" />

          {/* a nervous drop while the server thinks it over */}
          {mood === 'loading' && (
            <g className="lb-drop">
              <path d="M 112 44 q -4 6 0 9 a 4.5 4.5 0 0 0 0 -9 z" fill="#8FD6FF" opacity=".9" />
            </g>
          )}
          {/* he hums to himself while pretending not to look */}
          {(mood === 'hiding' || mood === 'peek') && (
            <g className="lb-note" fill="#F7DA85">
              <circle cx="112" cy="42" r="3.4" />
              <rect x="114.4" y="28" width="2" height="14" rx="1" />
            </g>
          )}

          {/* ── arms ── */}
          <g className="lb-arm" style={{ transform: arms[0], transformBox: 'fill-box', transformOrigin: '85% 15%' }}>
            <path d="M 24 92 q -10 4 -10 12" stroke="url(#lb-gold)" strokeWidth="4" strokeLinecap="round" fill="none" />
            <circle cx="14" cy="106" r="9" fill="#141414" stroke="url(#lb-gold)" strokeWidth="2.4" />
          </g>
          <g className="lb-arm" style={{ transform: arms[1], transformBox: 'fill-box', transformOrigin: '15% 15%' }}>
            <path d="M 116 92 q 10 4 10 12" stroke="url(#lb-gold)" strokeWidth="4" strokeLinecap="round" fill="none" />
            <circle cx="126" cy="106" r="9" fill="#141414" stroke="url(#lb-gold)" strokeWidth="2.4" />
          </g>
        </g>
      </svg>
    </div>
  );
}

/* A short burst when the password is right. Fixed values, not random ones,
   so the markup matches whatever the server rendered. */
const CONFETTI = [
  [-92, '#EEBC2E', '520deg'], [-58, '#F7DA85', '-380deg'], [-30, '#6EE7A0', '300deg'],
  [-8, '#EEBC2E', '-460deg'], [18, '#FFF6DA', '410deg'], [46, '#B78A16', '-300deg'],
  [74, '#6EE7A0', '480deg'], [104, '#F7DA85', '-520deg'], [-120, '#FFF6DA', '340deg'],
  [130, '#EEBC2E', '-410deg'], [-72, '#B78A16', '440deg'], [58, '#F7DA85', '-350deg'],
];

function Confetti() {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {CONFETTI.map(([dx, color, rot], i) => (
        <span key={i} className="lx-confetti" style={{
          background: color, '--dx': `${dx}px`, '--rot': rot,
          animationDelay: `${(i % 6) * 0.06}s`,
          borderRadius: i % 3 === 0 ? '50%' : '2px',
        }} />
      ))}
    </div>
  );
}

/* Tiles drifting through the stone behind the card. */
const TILES = [
  { s: 120, top: '12%', left: '6%',  r: '-12deg', tx: '40px',  ty: '-30px', d: '19s' },
  { s: 76,  top: '68%', left: '11%', r: '18deg',  tx: '-30px', ty: '26px',  d: '24s' },
  { s: 150, top: '58%', left: '80%', r: '9deg',   tx: '34px',  ty: '30px',  d: '27s' },
  { s: 92,  top: '16%', left: '84%', r: '-22deg', tx: '-36px', ty: '34px',  d: '21s' },
  { s: 58,  top: '38%', left: '92%', r: '30deg',  tx: '22px',  ty: '-26px', d: '16s' },
  { s: 64,  top: '86%', left: '46%', r: '-8deg',  tx: '-24px', ty: '-22px', d: '23s' },
];

function DriftingTiles() {
  return (
    <div className="lx-tiles" aria-hidden="true">
      {TILES.map((t, i) => (
        <div key={i} className="lx-tile" style={{
          width: t.s, height: t.s, top: t.top, left: t.left,
          '--r': t.r, '--tx': t.tx, '--ty': t.ty, '--d': t.d,
          animationDelay: `${i * -3}s`,
        }} />
      ))}
    </div>
  );
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

/**
 * Speaks a task out loud the moment it is delegated to you.
 *
 * Renders as the bell button in the Topbar (the on/off switch, which is also
 * how a muted user gets sound back) plus a floating toast carrying whatever
 * was just announced.
 *
 * The alert has to survive a browser that refuses to make noise before the
 * page has been touched — autoplay policy covers speech synthesis and the Web
 * Audio chime alike. So the first click/keypress anywhere "primes" both, and
 * anything that arrived before that moment is held in pendingRef and spoken as
 * soon as priming happens rather than being dropped silently.
 */

const POLL_MS = 20000;
const MUTE_KEY = 'celestile.voiceAlert.muted';
// v2: the cursor changed from a datetime string to epoch milliseconds, so an
// older stored value has to be discarded rather than compared against.
const cursorKey = (userId) => `celestile.voiceAlert.cursor.v2.${userId}`;

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

// Voices load asynchronously in Chrome; prefer an Indian-English one, then any
// English one, then whatever the browser defaults to.
function pickVoice() {
  let voices = [];
  try { voices = window.speechSynthesis.getVoices() || []; } catch { return null; }
  return voices.find((v) => v.lang === 'en-IN')
    || voices.find((v) => /^en[-_]/i.test(v.lang))
    || null;
}

function announcement(tasks) {
  if (tasks.length > 1) {
    return `Attention. You have ${tasks.length} new tasks delegated to you. Please check your dashboard.`;
  }
  const t = tasks[0];
  const what = String(t.description || 'a new task').replace(/\s+/g, ' ').trim().slice(0, 180);
  const by = t.by ? ` by ${t.by}` : '';
  const due = t.dueDate ? ` It is due on ${t.dueDate}.` : '';
  return `Attention. A new task has been delegated to you${by}. ${what}.${due}`;
}

export default function NewTaskVoiceAlert() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState(null);   // { tasks }
  const audioRef = useRef(null);              // AudioContext, once primed
  const primedRef = useRef(false);
  const pendingRef = useRef(null);            // text held back until primed
  const mutedRef = useRef(false);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { setMuted(read(MUTE_KEY) === '1'); }, []);

  // ── sound ──────────────────────────────────────────────────────────
  const chime = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    try {
      const at = ctx.currentTime;
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.25, at + i * 0.18 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.18 + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at + i * 0.18);
        osc.stop(at + i * 0.18 + 0.18);
      });
    } catch { /* no chime; the speech still carries the message */ }
  }, []);

  const say = useCallback((text) => {
    const synth = typeof window !== 'undefined' && window.speechSynthesis;
    if (!synth) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-IN';
      u.rate = 0.95;
      u.volume = 1;
      const v = pickVoice();
      if (v) u.voice = v;
      // Chrome parks the queue when a tab has been idle; resume() is a no-op
      // when it is not paused.
      synth.resume();
      synth.speak(u);
    } catch { /* speech unsupported — the chime and the toast remain */ }
  }, []);

  const announce = useCallback((text) => {
    if (mutedRef.current) return;
    if (!primedRef.current) { pendingRef.current = text; return; }
    chime();
    setTimeout(() => say(text), 420);
  }, [chime, say]);

  // First interaction anywhere unlocks audio, and flushes anything that was
  // announced while the page was still silent.
  useEffect(() => {
    const prime = () => {
      if (primedRef.current) return;
      primedRef.current = true;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          audioRef.current = audioRef.current || new Ctx();
          if (audioRef.current.state === 'suspended') audioRef.current.resume();
        }
      } catch { /* no Web Audio */ }
      try {
        // A silent utterance is what actually flips the "user has interacted"
        // bit for speech synthesis in Chrome.
        const warm = new SpeechSynthesisUtterance(' ');
        warm.volume = 0;
        window.speechSynthesis?.speak(warm);
      } catch { /* ignore */ }
      const held = pendingRef.current;
      pendingRef.current = null;
      if (held && !mutedRef.current) { chime(); setTimeout(() => say(held), 420); }
    };
    const opts = { passive: true };
    window.addEventListener('pointerdown', prime, opts);
    window.addEventListener('keydown', prime, opts);
    window.addEventListener('touchstart', prime, opts);
    return () => {
      window.removeEventListener('pointerdown', prime);
      window.removeEventListener('keydown', prime);
      window.removeEventListener('touchstart', prime);
    };
  }, [chime, say]);

  // ── polling ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const key = cursorKey(userId);
    let stopped = false;
    let inFlight = false;

    const tick = async () => {
      if (stopped || inFlight) return;
      if (document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const since = read(key) || '';
        const res = await fetch(`/api/delegations/new-tasks?since=${encodeURIComponent(since)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (stopped) return;
        // Store the new high-water mark BEFORE announcing, so a mid-speech
        // reload cannot replay the same task on the next poll.
        if (data.cursor) write(key, data.cursor);
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        if (tasks.length) {
          setToast({ tasks });
          announce(announcement(tasks));
        }
      } catch { /* offline / server restart — the next tick retries */ }
      finally { inFlight = false; }
    };

    tick();
    const t = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [userId, announce]);

  // The toast clears itself; a fresh alert restarts the clock.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 20000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!userId) return null;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    write(MUTE_KEY, next ? '1' : '0');
    if (next) { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
    else {
      primedRef.current = true;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) { audioRef.current = audioRef.current || new Ctx(); audioRef.current.resume?.(); }
      } catch { /* ignore */ }
      // Turning it back on proves it works, rather than leaving the user to
      // wonder until the next task arrives.
      chime();
      setTimeout(() => say('Voice alerts are on.'), 400);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={toggleMute}
        title={muted ? 'Voice alerts are off — click to turn on' : 'Voice alert on every new delegated task (click to mute)'}
        aria-label={muted ? 'Turn voice alerts on' : 'Turn voice alerts off'}
        aria-pressed={!muted}
        className={`shrink-0 p-2 rounded-lg transition hover:bg-slate-100 ${muted ? 'text-slate-300' : 'text-primary-500'}`}
      >
        {muted ? (
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.73 21a2 2 0 0 1-3.46 0" /><path d="M18.63 13A17.9 17.9 0 0 1 18 8" />
            <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" /><path d="M18 8a6 6 0 0 0-9.33-5" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        )}
      </button>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-[9999] max-w-sm rounded-2xl shadow-2xl animate-fade-in"
          style={{ background: '#18181B', border: '1px solid rgba(238,188,46,0.28)' }}
        >
          <div className="flex items-start gap-3 px-4 py-3.5">
            <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(238,188,46,0.14)', color: '#EEBC2E' }}>
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold" style={{ color: '#EEBC2E' }}>
                {toast.tasks.length > 1 ? `${toast.tasks.length} new tasks delegated to you` : 'New task delegated to you'}
              </div>
              {toast.tasks.slice(0, 3).map((t) => (
                <div key={t.id} className="text-[12px] mt-1 leading-snug" style={{ color: '#D4D4D8' }}>
                  {t.description}
                  {(t.by || t.dueDate) && (
                    <span style={{ color: '#8b8b93' }}>
                      {t.by ? ` · by ${t.by}` : ''}{t.dueDate ? ` · due ${t.dueDate}` : ''}
                    </span>
                  )}
                </div>
              ))}
              {!primedRef.current && (
                <div className="text-[11px] mt-1.5" style={{ color: '#8b8b93' }}>Click anywhere on the page to hear it.</div>
              )}
            </div>
            <button
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="shrink-0 w-7 h-7 rounded-lg grid place-items-center border-none cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

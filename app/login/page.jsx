'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', {
      email, password, redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError('Invalid email or password');
    } else {
        window.location.href = '/';;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'radial-gradient(ellipse at center,#0a1628 0%,#050b14 70%)'}}>
      {/* Neon background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10" style={{background:'#00f5ff',filter:'blur(120px)'}} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-8" style={{background:'#0080ff',filter:'blur(100px)'}} />
      </div>

      <div className="relative w-full max-w-md mx-4">
        {/* Card */}
        <div className="rounded-2xl p-8" style={{background:'rgba(10,22,40,0.8)',border:'1px solid rgba(0,245,255,0.2)',backdropFilter:'blur(20px)',boxShadow:'0 0 60px rgba(0,245,255,0.08), 0 24px 48px rgba(0,0,0,0.5)'}}>

          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <img src="/logo.png" alt="Indian Automotive" className="w-20 h-20 object-contain drop-shadow-lg"
                onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
              <div className="hidden w-16 h-16 rounded-xl items-center justify-center text-2xl font-black" style={{background:'rgba(0,245,255,0.1)',border:'1px solid rgba(0,245,255,0.3)',color:'#00f5ff'}}>IA</div>
            </div>
            <h1 className="text-xl font-bold" style={{color:'#00f5ff',textShadow:'0 0 20px rgba(0,245,255,0.5)'}}>Indian Automotive</h1>
            <p className="text-sm mt-1" style={{color:'rgba(148,163,184,0.7)'}}>Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{color:'rgba(0,245,255,0.7)'}}>Email</label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition"
                style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(0,245,255,0.2)',color:'#e2e8f0'}}
                onFocus={e => e.target.style.borderColor='rgba(0,245,255,0.6)'}
                onBlur={e => e.target.style.borderColor='rgba(0,245,255,0.2)'}
                placeholder="you@e-marketing.io"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{color:'rgba(0,245,255,0.7)'}}>Password</label>
              <input
                type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition"
                style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(0,245,255,0.2)',color:'#e2e8f0'}}
                onFocus={e => e.target.style.borderColor='rgba(0,245,255,0.6)'}
                onBlur={e => e.target.style.borderColor='rgba(0,245,255,0.2)'}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full font-semibold py-2.5 rounded-lg transition text-sm disabled:opacity-50"
              style={{background:'linear-gradient(135deg,#00f5ff,#00b8c7)',color:'#050b14',boxShadow:'0 0 16px rgba(0,245,255,0.4)'}}
            >
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
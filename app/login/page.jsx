'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
export default function LoginPage() {
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
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-sm mx-4">
        <div className="bg-white rounded-2xl shadow-elevated border border-slate-200 p-8">
          {/* Logo */}
          <div className="mb-7 text-center">
            <img src="/logo.png" alt="Indian Automotive" className="w-16 h-16 object-contain mx-auto mb-3"
              onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }} />
            <div className="hidden w-14 h-14 rounded-xl bg-primary-600 text-white text-xl font-black mx-auto mb-3 grid place-items-center">IA</div>
            <h1 className="text-lg font-bold text-slate-900">Indian Automotive</h1>
            <p className="text-sm text-slate-500 mt-0.5">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input" placeholder="you@e-marketing.io" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="input" placeholder="••••••••" />
            </div>
            {error && <p className="text-red-500 text-xs text-center">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
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
    <div className="min-h-screen flex items-center justify-center p-4" style={{background:'linear-gradient(135deg,#fde8d8 0%,#fdf0e8 50%,#fde8d8 100%)'}}>
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl shadow-elevated p-8">

          {/* Logo */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl overflow-hidden shadow-md flex items-center justify-center bg-slate-100">
              <img src="/logo.png" alt="Indian Automotive" className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display='none'; e.target.parentElement.style.background='#e11d48'; e.target.parentElement.innerHTML='<span style="color:white;font-size:22px;font-weight:900">IA</span>'; }} />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 mb-1">Task Manager</p>
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {[0,1,2].map(i => <span key={i} className={`rounded-full ${i===1?'w-2 h-2 bg-primary-600':'w-1.5 h-1.5 bg-primary-300'}`} />)}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome back 👋</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email Address</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                </span>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition"
                  placeholder="Enter your email" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Password</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition"
                  placeholder="Enter your password" />
              </div>
            </div>

            {error && <p className="text-red-500 text-xs text-center">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition disabled:opacity-60 flex items-center justify-center gap-2"
              style={{background:'linear-gradient(135deg,#e11d48,#be123c)',boxShadow:'0 4px 14px rgba(225,29,72,0.35)'}}>
              {loading ? 'Signing in…' : <>Sign In <span>→</span></>}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            <span className="font-semibold text-primary-600">Indian Automotive</span>
            <span className="mx-1.5">·</span>
            Task Management System
          </p>
        </div>
      </div>
    </div>
  );
}

'use client';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { data: session, update } = useSession();

  useEffect(() => {
    if (session?.error === 'ForceLogout') {
      signOut({ callbackUrl: '/login' });
      return;
    }
    // Force session refresh every 20s — only when tab is visible
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') update();
    }, 20000);
    return () => clearInterval(t);
  }, [session, update]);

  if (pathname === '/login' || pathname.startsWith('/developer')) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen relative">
      {/* Light aurora backdrop (matches the login page, lighter shade) */}
      <div className="app-bg" aria-hidden="true">
        <div className="orb" style={{ width: 560, height: 560, top: -160, left: -120, background: 'radial-gradient(circle, rgba(245,201,122,0.55), transparent 70%)', animation: 'app-drift1 20s ease-in-out infinite' }} />
        <div className="orb" style={{ width: 520, height: 520, bottom: -180, right: -120, background: 'radial-gradient(circle, rgba(228,150,90,0.40), transparent 70%)', animation: 'app-drift2 24s ease-in-out infinite' }} />
        <div className="orb" style={{ width: 420, height: 420, top: '35%', left: '55%', background: 'radial-gradient(circle, rgba(253,235,200,0.6), transparent 70%)', animation: 'app-drift3 28s ease-in-out infinite' }} />
      </div>

      <div className="relative z-10">
        <Sidebar />
        <div className="ml-16 flex flex-col min-h-screen">
          <Topbar />
          <main className="flex-1 p-4 lg:p-6 overflow-x-auto">
            <div className="max-w-[1600px] mx-auto min-w-[900px]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

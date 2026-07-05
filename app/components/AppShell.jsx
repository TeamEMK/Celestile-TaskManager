'use client';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { data: session, update } = useSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  // Close the mobile drawer whenever the route changes
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  if (pathname === '/login' || pathname.startsWith('/developer')) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen relative">
      {/* Light aurora backdrop (matches the login page, lighter shade) */}
      <div className="app-bg" aria-hidden="true">
        <div className="orb" style={{ width: 620, height: 620, top: -180, left: -140, background: 'radial-gradient(circle, rgba(232,200,154,0.55), transparent 70%)', animation: 'app-drift1 20s ease-in-out infinite' }} />
        <div className="orb" style={{ width: 560, height: 560, bottom: -200, right: -140, background: 'radial-gradient(circle, rgba(200,138,84,0.42), transparent 70%)', animation: 'app-drift2 24s ease-in-out infinite' }} />
        <div className="orb" style={{ width: 460, height: 460, top: '32%', left: '52%', background: 'radial-gradient(circle, rgba(248,235,205,0.60), transparent 70%)', animation: 'app-drift3 28s ease-in-out infinite' }} />
      </div>

      <div className="relative z-10">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="md:ml-[230px] lg:ml-16 flex flex-col min-h-screen">
          <Topbar onMenuClick={() => setMobileNavOpen(true)} />
          <main className="flex-1 p-4 lg:p-6 overflow-x-auto">
            <div className="max-w-[1600px] mx-auto lg:min-w-[900px]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

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
  // Desktop rail state — the sidebar expands on hover (no click needed). The
  // state lives here so the content margin can follow it: the panel pushes the
  // page sideways instead of sitting on top of it and hiding what's underneath.
  const [navExpanded, setNavExpanded] = useState(false);

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
      {/* No aurora backdrop. Three drifting gold orbs behind every page tinted
          the cards on top of them and kept the whole app looking festive; the
          flat body colour in globals.css is the backdrop now. */}

      <div className="relative z-10">
        <Sidebar
          mobileOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          expanded={navExpanded}
          onExpandChange={setNavExpanded}
        />
        <div className={`md:ml-[230px] flex flex-col min-h-screen transition-[margin-left] duration-200 ease-out ${navExpanded ? 'lg:ml-[230px]' : 'lg:ml-16'}`}>
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

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
    <div className="min-h-screen">
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
  );
}

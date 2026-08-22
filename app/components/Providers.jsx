'use client';
import { SessionProvider } from 'next-auth/react';

// refetchInterval is in SECONDS. It was 20, so every open tab hit
// /api/auth/session three times a minute, and each hit re-runs the jwt()
// callback -> getUserAuthState() -> a users query. The 5s state cache never
// helped, because the poll was always slower than the cache. 120s still
// applies a role change, an access change or a force-logout well inside the
// window anyone would notice, at a sixth of the load.
//
// AppShell already runs its own visibility-aware update() timer, so this only
// needs to be the backstop.
export default function Providers({ children }) {
  return (
    <SessionProvider refetchInterval={120} refetchOnWindowFocus={true}>
      {children}
    </SessionProvider>
  );
}

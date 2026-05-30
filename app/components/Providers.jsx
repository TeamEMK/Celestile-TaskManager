'use client';
import { SessionProvider } from 'next-auth/react';

export default function Providers({ children }) {
  return <SessionProvider refetchInterval={20} refetchOnWindowFocus={true}>{children}</SessionProvider>;
}
import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '../components/AppShell';
import { DynamicProvider } from '../components/DynamicProvider';

export const metadata: Metadata = { title: 'Chama', description: 'USDC cooperative finance on Arc' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><DynamicProvider><AppShell>{children}</AppShell></DynamicProvider></body></html>;
}

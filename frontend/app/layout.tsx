import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '../components/AppShell';
import { DynamicProvider } from '../components/DynamicProvider';

export const metadata: Metadata = { title: 'Chama — save together', description: 'A transparent savings community on Arc', viewport: 'width=device-width, initial-scale=1, maximum-scale=1' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><DynamicProvider><AppShell>{children}</AppShell></DynamicProvider></body></html>;
}

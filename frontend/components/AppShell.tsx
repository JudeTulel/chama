'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Home, Landmark, PiggyBank, ShieldCheck, UserRound } from 'lucide-react';
import { WalletButton } from './DynamicProvider';

const nav = [['/', Home, 'Home'], ['/deposit', PiggyBank, 'Deposit'], ['/loans', Landmark, 'Loans'], ['/health', ShieldCheck, 'Health'], ['/profile', UserRound, 'Profile']] as const;
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/' || pathname === '/onboarding') return <div className="app welcome-app">{children}</div>;
  return <div className="app"><header className="topbar"><div className="topbar-inner"><div className="greeting"><div className="avatar">C</div><div><div className="eyebrow">YOUR COMMUNITY</div><div className="title">Chama member</div></div></div><div className="top-actions"><WalletButton/><button className="bell" aria-label="Notifications"><Bell size={19}/><span className="dot"/></button></div></div></header>{children}<nav className="nav" aria-label="Main navigation">{nav.map(([href, Icon, label]) => { const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`); return <Link href={href} key={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}><Icon/><span>{label}</span></Link>; })}</nav></div>;
}

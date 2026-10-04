'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, Home, Landmark, PiggyBank, ShieldCheck, UserRound } from 'lucide-react';
import { WalletButton } from './DynamicProvider';
import { readSelectedChama, selectedChamaEventName } from '../src/config/selectedChama';

const nav = [['/', Home, 'Home'], ['/deposit', PiggyBank, 'Deposit'], ['/loans', Landmark, 'Loans'], ['/health', ShieldCheck, 'Health'], ['/manage', ShieldCheck, 'Manage'], ['/profile', UserRound, 'Profile']] as const;
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [chamaName, setChamaName] = useState('Your chama');
  useEffect(() => {
    const update = () => {
      const selected = readSelectedChama();
      setChamaName(selected.name?.trim() || 'Your chama');
    };
    update();
    window.addEventListener(selectedChamaEventName(), update);
    return () => window.removeEventListener(selectedChamaEventName(), update);
  }, []);
  if (pathname === '/' || pathname === '/onboarding') return <div className="app welcome-app">{children}</div>;
  return <div className="app"><aside className="sidebar" aria-label="Main navigation"><div className="sidebar-brand"><div className="avatar">{chamaName.charAt(0).toUpperCase()}</div><div><div className="eyebrow">YOUR COMMUNITY</div><div className="title">{chamaName}</div></div></div><nav className="sidebar-nav">{nav.map(([href, Icon, label]) => { const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`); return <Link href={href} key={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}><Icon/><span>{label}</span></Link>; })}</nav><div className="sidebar-wallet"><WalletButton/></div></aside><header className="topbar"><div className="topbar-inner"><div className="greeting"><div className="avatar">{chamaName.charAt(0).toUpperCase()}</div><div><div className="eyebrow">YOUR COMMUNITY</div><div className="title">{chamaName}</div></div></div><div className="top-actions"><div className="mobile-wallet"><WalletButton/></div><button className="bell" aria-label="Notifications"><Bell size={19}/><span className="dot"/></button></div></div></header>{children}<nav className="nav" aria-label="Main navigation">{nav.map(([href, Icon, label]) => { const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`); return <Link href={href} key={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}><Icon/><span>{label}</span></Link>; })}</nav></div>;
}

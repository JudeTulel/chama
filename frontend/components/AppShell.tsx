'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, ChartNoAxesCombined, CircleDollarSign, Home, Landmark, PiggyBank, Settings, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { WalletButton } from './DynamicProvider';
import { readSelectedChama, selectedChamaEventName } from '../src/config/selectedChama';

const nav = [['/dashboard', Home, 'Overview'], ['/deposit', PiggyBank, 'Deposit'], ['/loans', Landmark, 'Loans'], ['/guarantees', UsersRound, 'Guarantees'], ['/health', ChartNoAxesCombined, 'Health'], ['/profile', UserRound, 'Activity'], ['/settings', Settings, 'Settings']] as const;
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
  return <div className="app app-shell"><aside className="sidebar"><Link href="/dashboard" className="brand-mark"><span className="brand-glyph">C</span><span>chama</span></Link><div className="sidebar-label">Workspace</div><nav className="side-nav" aria-label="Main navigation">{nav.map(([href, Icon, label]) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link href={href} key={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}><Icon size={18}/><span>{label}</span></Link>; })}</nav><div className="sidebar-foot"><span className="network-dot"/> Arc Testnet <span className="network-live">Live</span></div></aside><div className="shell-main"><header className="topbar"><div className="topbar-inner"><div className="greeting"><div className="avatar">{chamaName.charAt(0).toUpperCase()}</div><div><div className="eyebrow">YOUR COMMUNITY</div><div className="title">{chamaName}</div></div></div><div className="top-actions"><WalletButton/><button className="bell" aria-label="Notifications"><Bell size={19}/><span className="dot"/></button></div></div></header>{children}</div></div>;
}

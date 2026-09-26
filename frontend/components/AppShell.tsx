'use client';
import Link from 'next/link';
import { Bell, Home, Landmark, PiggyBank, ShieldCheck, UserRound } from 'lucide-react';
import { WalletButton } from './DynamicProvider';

const nav = [['/', Home, 'Home'], ['/deposit', PiggyBank, 'Deposit'], ['/loans', Landmark, 'Loans'], ['/health', ShieldCheck, 'Health'], ['/profile', UserRound, 'Profile']] as const;
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="app"><header className="topbar"><div className="topbar-inner"><div className="greeting"><div className="avatar">JT</div><div><div className="eyebrow">Welcome back</div><div className="title">Jude Tulel</div></div></div><div className="top-actions"><WalletButton/><button className="bell" aria-label="Notifications"><Bell size={19}/><span className="dot"/></button></div></div></header>{children}<nav className="nav">{nav.map(([href, Icon, label]) => <Link href={href} key={href}><Icon/><span>{label}</span></Link>)}</nav></div>;
}

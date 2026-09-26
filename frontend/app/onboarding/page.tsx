'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Hash, Users } from 'lucide-react';
import { WalletButton } from '../../components/DynamicProvider';

export default function OnboardingPage() {
  const [code, setCode] = useState('');
  const router = useRouter();
  function continueWithCode() {
    const clean = code.trim();
    if (clean) router.push(`/join/${encodeURIComponent(clean)}`);
  }
  return <main className="page onboarding"><section className="section"><div className="onboarding-icon"><Users size={25}/></div><div className="eyebrow">WELCOME TO CHAMA</div><h1 className="hero-title">Join your savings community</h1><p className="muted">Connect your wallet and enter a chama invite code to find the right community. Every chama has its own members, vault, loans, and insurance fund.</p><div className="card onboarding-card"><label className="field-label" htmlFor="chama-code">Do you have a chama code?</label><div className="input-wrap"><Hash size={17}/><input id="chama-code" className="input code-input" value={code} onChange={e => setCode(e.target.value)} placeholder="CHAMA-8F4K-92MX-Q7TP" onKeyDown={e => e.key === 'Enter' && continueWithCode()}/></div><button className="primary" onClick={continueWithCode} disabled={!code.trim()}>Find chama <ArrowRight size={17}/></button><div className="or"><span>or</span></div><button className="secondary" onClick={() => router.push('/chamas')}>Browse public chamas</button></div></section><section className="section"><div className="card join-note"><strong>Already have a wallet?</strong><p className="muted">Connect first, then use a private invite link from your chama owner. A code identifies the chama but does not bypass owner approval.</p><WalletButton/></div></section></main>;
}

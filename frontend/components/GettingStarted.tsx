'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CircleHelp, Eye, KeyRound, Link2, LoaderCircle, ShieldCheck, Sparkles, Users, Wallet } from 'lucide-react';
import { ChainEnum } from '@dynamic-labs/sdk-api-core';
import { DynamicConnectButton, useDynamicContext, useDynamicWaas } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import type { ChamaDeployment } from '../src/config/contracts';
import { saveSelectedChama } from '../src/config/selectedChama';
import { createChamaOnchain } from '../src/config/onboardingActions';
import { ReturningUserChamas } from './ReturningUserChamas';

const environmentReady = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);
type Step = 'start' | 'path' | 'wallet' | 'join' | 'create';
type Intent = 'join' | 'create';

export function GettingStarted() {
  if (!environmentReady) return <OnboardingWithoutWallet />;
  return <WalletEnabledOnboarding />;
}

function OnboardingWithoutWallet() {
  const [step, setStep] = useState<'start' | 'path' | 'wallet'>('start');
  return <main className="page onboarding welcome-flow">
    {step === 'start' && <LandingStart onStart={() => setStep('path')} />}
    {step === 'path' && <><StepHeader step={1} onBack={() => setStep('start')} /><FlowHeading step={1} title="What would you like to do?" detail="Choose a path. You can do the other one later." /><div className="choice-grid"><button className="choice-card" onClick={() => setStep('wallet')}><span className="choice-icon"><Users /></span><strong>Create a chama</strong><span className="muted">Set up a savings group for your community.</span><ArrowRight className="choice-arrow" /></button><button className="choice-card" onClick={() => setStep('wallet')}><span className="choice-icon choice-icon-warm"><Link2 /></span><strong>Join a chama</strong><span className="muted">Use an invite code from someone you trust.</span><ArrowRight className="choice-arrow" /></button></div></>}
    {step === 'wallet' && <><StepHeader step={2} onBack={() => setStep('path')} /><FlowHeading step={2} title="Let’s set up your wallet" detail="Wallet connection is not available yet because this app has no Dynamic environment configured." /><div className="card flow-form"><strong>One setup step needed</strong><p className="muted">Add `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` to `frontend/.env.local`, enable Arc Testnet (5042002), and configure an EVM embedded wallet in the Dynamic dashboard. Then you can create a wallet or connect an existing one here.</p><div className="setup-message">No wallet is connected. Create/join transactions remain disabled.</div></div></>}
  </main>;
}

function WalletEnabledOnboarding() {
  const router = useRouter();
  const { primaryWallet, setShowAuthFlow, user } = useDynamicContext();
  const { createWalletAccount, getWaasWallets, dynamicWaasIsEnabled } = useDynamicWaas();
  const [step, setStep] = useState<Step>('start');
  const [intent, setIntent] = useState<Intent>('join');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function createEmbeddedWallet() {
    setError('');
    if (!user) {
      setShowAuthFlow(true);
      setError('Sign in with an enabled email or social method, then choose Create wallet again.');
      return;
    }
    setBusy(true);
    try {
      if (getWaasWallets().some(wallet => wallet.chain === 'EVM')) {
        setError('An embedded EVM wallet already exists for this account. Choose Continue with wallet.');
        return;
      }
      if (!dynamicWaasIsEnabled) throw new Error('Embedded wallets are not enabled for this Dynamic environment. Enable EVM embedded wallets in the Dynamic dashboard.');
      const created = await createWalletAccount([ChainEnum.Evm]);
      if (created.some(wallet => wallet?.accountAddress)) setStep(intent === 'join' ? 'join' : 'create');
      else setError('No EVM wallet was returned. Check the embedded-wallet and Arc chain settings in Dynamic.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create an embedded wallet.');
    } finally { setBusy(false); }
  }

  function continueWithWallet() {
    if (!primaryWallet?.address) return;
    setError('');
    setStep(intent === 'join' ? 'join' : 'create');
  }

  function startIntent(value: Intent) {
    setIntent(value);
    setError('');
    setStep(primaryWallet?.address ? value : 'wallet');
  }

  if (step === 'start') return <main className="page onboarding landing-page welcome-flow"><LandingStart onStart={() => setStep('path')} walletAction={!primaryWallet?.address ? <DynamicConnectButton><span className="secondary wallet-connect">Connect wallet to see your chamas</span></DynamicConnectButton> : undefined} />{primaryWallet?.address && <ReturningUserChamas walletAddress={primaryWallet.address as `0x${string}`} onSelect={() => router.push('/deposit')} />}</main>;

  if (step === 'path') return <main className="page onboarding welcome-flow"><StepHeader step={1} onBack={() => setStep('start')} /><FlowHeading step={1} title="What would you like to do?" detail="Choose a path. You can do the other one later." /><div className="choice-grid"><button className="choice-card" onClick={() => startIntent('create')}><span className="choice-icon"><Users /></span><strong>Create a chama</strong><span className="muted">Set up a savings group for your community.</span><ArrowRight className="choice-arrow" /></button><button className="choice-card" onClick={() => startIntent('join')}><span className="choice-icon choice-icon-warm"><Link2 /></span><strong>Join a chama</strong><span className="muted">Use an invite code from someone you trust.</span><ArrowRight className="choice-arrow" /></button></div><p className="flow-footnote"><CircleHelp size={15} /> No wallet yet? We’ll help you create one next.</p></main>;

  if (step === 'wallet') return <main className="page onboarding welcome-flow"><StepHeader step={2} onBack={() => setStep('path')} /><FlowHeading step={2} title="Let’s set up your wallet" detail="Your wallet approves membership requests and signs chama actions. You stay in control." /><div className="choice-grid wallet-choices"><div className="choice-card wallet-choice"><span className="choice-icon"><KeyRound /></span><strong>Create a wallet</strong><span className="muted">Sign in with an enabled email or social method, then create an embedded EVM wallet.</span><button className="primary" disabled={busy} onClick={createEmbeddedWallet}>{busy ? <><LoaderCircle className="spin" /> Creating wallet…</> : 'Create wallet'}</button></div><div className="choice-card wallet-choice"><span className="choice-icon choice-icon-warm"><Wallet /></span><strong>I already have a wallet</strong><span className="muted">Connect MetaMask, WalletConnect, or another supported EVM wallet.</span><DynamicConnectButton><span className="secondary wallet-connect">Connect existing wallet</span></DynamicConnectButton></div></div>{primaryWallet?.address && <div className="connected-card"><Check size={17} /><span>Connected · {primaryWallet.address.slice(0, 6)}…{primaryWallet.address.slice(-4)}</span><button className="primary" onClick={continueWithWallet}>Continue <ArrowRight size={16} /></button></div>}{error && <p className="feedback error">{error}</p>}<p className="flow-footnote"><ShieldCheck size={15} /> Chama will never ask for your seed phrase or private key.</p></main>;

  if (step === 'join') return <main className="page onboarding welcome-flow"><StepHeader step={3} onBack={() => setStep(primaryWallet?.address ? 'path' : 'wallet')} /><FlowHeading step={3} title="Enter your invite code" detail="Ask a chama member for their private invite code." /><div className="card flow-form"><label className="field-label" htmlFor="chama-code">Invite code</label><input id="chama-code" className="input" value={code} onChange={event => setCode(event.target.value)} placeholder="Paste your invite code" onKeyDown={event => event.key === 'Enter' && code.trim() && router.push(`/join/${encodeURIComponent(code.trim())}`)} /><button className="primary" disabled={!primaryWallet?.address || !code.trim()} onClick={() => router.push(`/join/${encodeURIComponent(code.trim())}`)}>Review invitation <ArrowRight size={17} /></button></div><p className="flow-footnote"><ShieldCheck size={15} /> The chama owner reviews your request. The code alone does not grant membership.</p></main>;

  return <main className="page onboarding welcome-flow"><StepHeader step={3} onBack={() => setStep(primaryWallet?.address ? 'path' : 'wallet')} /><FlowHeading step={3} title="Create your chama" detail="Your connected wallet will own the new chama. Factory deployment creates its savings pool and membership contracts." /><CreateChamaForm onError={setError} onSuccess={deployment => { saveSelectedChama(deployment); router.push('/deposit'); }} />{error && <p className="feedback error">{error}</p>}<p className="flow-footnote"><ShieldCheck size={15} /> Creating a chama is an on-chain action and requires Arc Testnet gas.</p></main>;
}

function LandingStart({ onStart, walletAction }: { onStart: () => void; walletAction?: ReactNode }) {
  return <>
    <section className="landing-hero"><div className="landing-copy"><div className="brand-kicker"><Sparkles size={14} /> SAVING IS STRONGER TOGETHER</div><h1 className="landing-title">Grow with<br /><span>your people.</span></h1><p className="muted">Start a chama for your community or join one you trust. Bring the group together, agree the rules, and grow with clarity.</p><button className="primary landing-cta" onClick={onStart}>Get started <ArrowRight size={18} /></button>{walletAction && <div className="landing-wallet-action">{walletAction}</div>}<div className="landing-points"><span><ShieldCheck size={15} /> You stay in control</span><span><Wallet size={15} /> Your wallet, your keys</span></div></div><div className="landing-art"><Image src="/savings.png" alt="A diverse group growing together" width={720} height={520} priority /><div className="art-note"><span className="art-note-icon"><Eye size={17} /></span><div><strong>Everyone sees the same story</strong><small>Contributions · loans · payouts</small></div></div></div></section>
    <section className="landing-values" aria-label="Why groups choose Chama"><article><span className="value-icon"><Users size={17} /></span><h2>Start together</h2><p>Create a group or join one you trust in a few simple steps.</p></article><article><span className="value-icon"><Eye size={17} /></span><h2>See the full picture</h2><p>Keep contributions, shares, and group activity easy to understand.</p></article><article><span className="value-icon"><ShieldCheck size={17} /></span><h2>Keep control</h2><p>Wallet approvals and owner review keep decisions with your group.</p></article></section>
    <div className="landing-disclosure"><span className="disclosure-dot" /><p>Built for real communities — powered by USDC on Arc Testnet.</p></div>
  </>;
}

function StepHeader({ step, onBack }: { step: number; onBack: () => void }) { return <div className="flow-stepper"><button className="back" onClick={onBack}><ArrowLeft size={16} /> Back</button><span>Step {step} of 3</span></div>; }
function FlowHeading({ step, title, detail }: { step: number; title: string; detail: string }) { return <div className="flow-heading"><div className="eyebrow">STEP {step} OF 3</div><h1 className="hero-title">{title}</h1><p className="muted">{detail}</p></div>; }
function CreateChamaForm({ onError, onSuccess }: { onError: (message: string) => void; onSuccess: (deployment: ChamaDeployment) => void }) {
  const { primaryWallet } = useDynamicContext();
  const [busy, setBusy] = useState(false);
  return <div className="card flow-form"><div className="create-summary"><span className="choice-icon"><Users /></span><div><strong>Chama on Arc Testnet</strong><p className="muted">Your wallet will be the owner. Treasury defaults to your wallet.</p></div></div><button className="primary" disabled={!primaryWallet?.address || busy} onClick={async () => { if (!primaryWallet) return; setBusy(true); onError(''); try { if (!isEthereumWallet(primaryWallet)) throw new Error('Connect an EVM wallet to create a chama.'); const deployment = await createChamaOnchain(primaryWallet); onSuccess(deployment); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not create chama.') } finally { setBusy(false) } }}>{busy ? <><LoaderCircle className="spin" /> Creating your chama…</> : 'Create chama on Arc'}</button></div>;
}

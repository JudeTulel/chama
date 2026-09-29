'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { keccak256, stringToHex, type Address } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { ArrowLeft, CheckCircle2, Hash, ShieldCheck, Users } from 'lucide-react';
import { addresses, publicClient, type ChamaDeployment } from '../../../src/config/contracts';
import { chamaDirectoryAbi } from '../../../src/abi/ChamaDirectory';
import { saveSelectedChama } from '../../../src/config/selectedChama';
import { ensureWalletNetwork } from '../../../src/config/networkActions';

const dynamicEnvironmentReady = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);

export default function JoinPage() {
  if (!dynamicEnvironmentReady) return <main className="page"><section className="section"><div className="card"><h1 className="section-title">Wallet setup required</h1><p className="muted">Configure `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` in `frontend/.env.local` to connect a wallet and submit a membership request. Invite lookup and the rest of the site can still be previewed.</p></div></section></main>;
  return <JoinWalletPage />;
}

function JoinWalletPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { primaryWallet } = useDynamicContext();
  const [chama, setChama] = useState<ChamaDeployment | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [networkStatus, setNetworkStatus] = useState('');
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const [requestingJoin, setRequestingJoin] = useState(false);
  const autoSwitchAttemptedFor = useRef('');
  const code = decodeURIComponent(params.code || '');
  useEffect(() => {
    async function resolve() {
      try {
        const invite = await publicClient.readContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'invites', args: [keccak256(stringToHex(code))] });
        const inviteData = invite as readonly [bigint, bigint, bigint, bigint, boolean];
        if (!inviteData[4] || (inviteData[1] !== BigInt(0) && BigInt(Math.floor(Date.now() / 1000)) > inviteData[1]) || inviteData[3] >= inviteData[2]) throw new Error('This invite is inactive, expired, or fully used.');
        const raw = await publicClient.readContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'chamas', args: [inviteData[0]] });
        const c = raw as readonly [Address, Address, Address, Address, Address, Address, string, string, boolean, boolean];
        const deployment = { chamaId: inviteData[0], owner: c[0], usdc: c[1], registry: c[2], insuranceFund: c[3], vault: c[4], lending: c[5], name: c[6], metadataURI: c[7], active: c[8], acceptingMembers: c[9] };
        if (!deployment.active || !deployment.acceptingMembers) throw new Error('This chama is not currently accepting members.');
        saveSelectedChama(deployment);
        setChama(deployment);
      } catch (e) { setError(e instanceof Error ? e.message : 'Unable to resolve this invite.'); } finally { setLoading(false); }
    }
    if (addresses.directory !== '0x0000000000000000000000000000000000000000') resolve(); else { setError('Chama directory address is not configured.'); setLoading(false); }
  }, [code]);

  useEffect(() => {
    if (!chama || !primaryWallet?.address || !isEthereumWallet(primaryWallet)) return;
    const walletAddress = primaryWallet.address.toLowerCase();
    if (autoSwitchAttemptedFor.current === walletAddress) return;
    autoSwitchAttemptedFor.current = walletAddress;

    let active = true;
    setSwitchingNetwork(true);
    setNetworkStatus(`Requesting switch to ${publicClient.chain.name}…`);
    void ensureWalletNetwork(primaryWallet, publicClient.chain.id)
      .then(() => {
        if (active) setNetworkStatus(`Wallet connected to ${publicClient.chain.name}.`);
      })
      .catch(cause => {
        if (active) setNetworkStatus(cause instanceof Error ? cause.message : 'Could not switch wallet network. You can retry when requesting to join.');
      })
      .finally(() => {
        if (active) setSwitchingNetwork(false);
      });
    return () => { active = false; };
  }, [chama, primaryWallet]);

  async function requestJoin() {
    if (!primaryWallet?.address) { setError('Connect your wallet before requesting to join.'); return; }
    if (!isEthereumWallet(primaryWallet)) { setError('Connect an EVM wallet for Arc.'); return; }
    setRequestingJoin(true);
    setError('');
    try {
      await ensureWalletNetwork(primaryWallet, publicClient.chain.id);
      const walletClient = await primaryWallet.getWalletClient();
      if (walletClient.chain?.id !== publicClient.chain.id) throw new Error(`Wallet is not using ${publicClient.chain.name} after the network switch.`);
      const hash = await walletClient.writeContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'requestJoin', args: [keccak256(stringToHex(code))], chain: walletClient.chain });
      await publicClient.waitForTransactionReceipt({ hash });
      setError('Join request submitted. The chama owner must approve your wallet.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Join request failed.'); }
    finally { setRequestingJoin(false); }
  }
  return <main className="page"><section className="section"><button className="back" onClick={() => router.back()}><ArrowLeft size={17}/> Back</button></section>{loading ? <div className="card">Resolving invite code…</div> : error && !chama ? <div className="alert"><Hash size={18}/>{error}</div> : chama ? <><section className="section"><div className="onboarding-icon"><Users size={25}/></div><div className="eyebrow">YOU'RE INVITED</div><h1 className="hero-title">{chama.name || 'A private chama'}</h1><p className="muted">Join this Arc USDC savings community. The owner reviews every request before membership is activated.</p></section><section className="section"><div className="card"><div className="join-detail"><ShieldCheck color="#16845f"/><div><strong>Separate chama economy</strong><p className="muted">This invite resolves to its own registry, vault, lending module, and insurance fund.</p></div></div><div className="join-detail"><CheckCircle2 color="#16845f"/><div><strong>Owner approval required</strong><p className="muted">Your wallet will submit a join request. The code alone never grants access.</p></div></div><button className="primary" onClick={requestJoin} disabled={switchingNetwork || requestingJoin}>{requestingJoin ? 'Submitting request…' : switchingNetwork ? 'Switching network…' : 'Request to join'} <ArrowLeft size={17} style={{transform:'rotate(180deg)'}}/></button>{networkStatus && <p className="muted" style={{marginTop:12}}>{networkStatus}</p>}{error && <p className="muted" style={{color:'#a8453f',marginTop:12}}>{error}</p>}</div></section></> : null}</main>;
}

'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { keccak256, stringToHex, type Address } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { ArrowLeft, CheckCircle2, Hash, ShieldCheck, Users } from 'lucide-react';
import { addresses, publicClient, type ChamaDeployment } from '../../../src/config/contracts';
import { chamaDirectoryAbi } from '../../../src/abi/ChamaDirectory';

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { primaryWallet } = useDynamicContext();
  const [chama, setChama] = useState<ChamaDeployment | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const code = decodeURIComponent(params.code || '');
  useEffect(() => {
    async function resolve() {
      try {
        const invite = await publicClient.readContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'invites', args: [keccak256(stringToHex(code))] });
        const inviteData = invite as readonly [bigint, bigint, bigint, bigint, boolean];
        if (!inviteData[4]) throw new Error('This invite is inactive or expired.');
        const raw = await publicClient.readContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'chamas', args: [inviteData[0]] });
        const c = raw as readonly [Address, Address, Address, Address, Address, Address, string, string, boolean, boolean];
        setChama({ chamaId: inviteData[0], owner: c[0], usdc: c[1], registry: c[2], insuranceFund: c[3], vault: c[4], lending: c[5], name: c[6], metadataURI: c[7], active: c[8], acceptingMembers: c[9] });
      } catch (e) { setError(e instanceof Error ? e.message : 'Unable to resolve this invite.'); } finally { setLoading(false); }
    }
    if (addresses.directory !== '0x0000000000000000000000000000000000000000') resolve(); else { setError('Chama directory address is not configured.'); setLoading(false); }
  }, [code]);
  async function requestJoin() {
    if (!primaryWallet?.address) { setError('Connect your wallet before requesting to join.'); return; }
    if (!isEthereumWallet(primaryWallet)) { setError('Connect an EVM wallet for Arc.'); return; }
    try {
      const walletClient = await primaryWallet.getWalletClient();
      const hash = await walletClient.writeContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'requestJoin', args: [keccak256(stringToHex(code))], chain: walletClient.chain });
      await publicClient.waitForTransactionReceipt({ hash });
      setError('Join request submitted. The chama owner must approve your wallet.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Join request failed.'); }
  }
  return <main className="page"><section className="section"><button className="back" onClick={() => router.back()}><ArrowLeft size={17}/> Back</button></section>{loading ? <div className="card">Resolving invite code…</div> : error && !chama ? <div className="alert"><Hash size={18}/>{error}</div> : chama ? <><section className="section"><div className="onboarding-icon"><Users size={25}/></div><div className="eyebrow">YOU'RE INVITED</div><h1 className="hero-title">{chama.name || 'A private chama'}</h1><p className="muted">Join this Arc USDC savings community. The owner reviews every request before membership is activated.</p></section><section className="section"><div className="card"><div className="join-detail"><ShieldCheck color="#16845f"/><div><strong>Separate chama economy</strong><p className="muted">This invite resolves to its own registry, vault, lending module, and insurance fund.</p></div></div><div className="join-detail"><CheckCircle2 color="#16845f"/><div><strong>Owner approval required</strong><p className="muted">Your wallet will submit a join request. The code alone never grants access.</p></div></div><button className="primary" onClick={requestJoin}>Request to join <ArrowLeft size={17} style={{transform:'rotate(180deg)'}}/></button>{error && <p className="muted" style={{color:'#a8453f',marginTop:12}}>{error}</p>}</div></section></> : null}</main>;
}

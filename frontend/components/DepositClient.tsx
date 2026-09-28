'use client';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { ArrowDownToLine, Check, LoaderCircle, ShieldCheck, Users, WalletCards } from 'lucide-react';
import { erc20Abi, formatUnits, parseUnits, type Address } from 'viem';
import { addresses, publicClient } from '../src/config/contracts';
import { chamaVaultAbi } from '../src/abi/ChamaVault';
import { chamaDirectoryAbi } from '../src/abi/ChamaDirectory';
import { ensureWalletNetwork } from '../src/config/networkActions';
import { ChamaOwnerTools } from './ChamaOwnerTools';
import { readSelectedChama, saveSelectedChama, selectedChamaEventName } from '../src/config/selectedChama';
import type { ChamaDeployment } from '../src/config/contracts';

const formatUsdc = (amount: bigint) => {
  const [whole = '0', fraction = ''] = formatUnits(amount, 6).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0').slice(0, 2)}`;
};
const registryReadAbi = [{ type: 'function', name: 'isMember', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'bool' }] }] as const;

async function assertChamaMatchesDirectory(chama: ChamaDeployment) {
  const raw = await publicClient.readContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'chamas', args: [chama.chamaId] });
  const onChain = raw as readonly [Address, Address, Address, Address, Address, Address, string, string, boolean, boolean];
  const matches = [chama.owner, chama.usdc, chama.registry, chama.insuranceFund, chama.vault, chama.lending]
    .every((expected, index) => expected.toLowerCase() === String(onChain[index]).toLowerCase());
  if (chama.usdc.toLowerCase() !== addresses.usdc.toLowerCase()) throw new Error('This deployment uses a different token than the configured USDC. Deposit is disabled.');
  if (!matches || !onChain[8] || !onChain[9]) throw new Error('Selected chama does not match an active deployment in the on-chain directory. Re-open its invite.');
}

const dynamicEnvironmentReady = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);

export default function DepositClient() {
  if (!dynamicEnvironmentReady) {
    return <main className="page finance-page"><DepositHero/><section className="section"><div className="card"><h1 className="section-title">Wallet setup required</h1><p className="muted">Set `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` in `frontend/.env.local` to enable wallet reads and signed deposits. No sample balances are shown.</p></div></section></main>;
  }
  return <DepositWallet />;
}

function DepositHero() {
  return <section className="section deposit-hero">
    <div className="deposit-copy">
    <span className="eyebrow">YOUR SAVINGS, GROWING TOGETHER</span>
    <h1 className="hero-title">Small steps.<br/>Shared strength.</h1>
    <p className="muted">Every contribution helps the whole chama move forward.</p>
    </div>
    <div className="illustration-frame"><Image src="/savings.png" alt="Two chama members nurturing a shared growing plant" width={720} height={520} priority/></div></section>;
}

function DepositWallet() {
  const { primaryWallet } = useDynamicContext();
  const [chama, setChama] = useState<ChamaDeployment | null>(null);
  const [amount, setAmount] = useState('');
  const [walletBalance, setWalletBalance] = useState(BigInt(0));
  const [shares, setShares] = useState(BigInt(0));
  const [shareValue, setShareValue] = useState(BigInt(0));
  const [totalAssets, setTotalAssets] = useState(BigInt(0));
  const [liquidAssets, setLiquidAssets] = useState(BigInt(0));
  const [insuranceBalance, setInsuranceBalance] = useState(BigInt(0));
  const [isMember, setIsMember] = useState(false);
  const [hasLiveData, setHasLiveData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const update = () => setChama(readSelectedChama());
    update();
    window.addEventListener(selectedChamaEventName(), update);
    return () => window.removeEventListener(selectedChamaEventName(), update);
  }, []);

  const refresh = useCallback(async () => {
    if (!chama || !primaryWallet?.address) return;
    setLoading(true); setError(''); setHasLiveData(false);
    try {
      await assertChamaMatchesDirectory(chama);
      const account = primaryWallet.address as Address;
      const [balance, userShares, assets, liquid, reserve, member] = await Promise.all([
        publicClient.readContract({ address: chama.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
        publicClient.readContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'balanceOf', args: [account] }),
        publicClient.readContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'totalAssets' }),

        publicClient.readContract({ address: chama.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [chama.vault] }),
        publicClient.readContract({ address: chama.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [chama.insuranceFund] }),
        publicClient.readContract({ address: chama.registry, abi: registryReadAbi, functionName: 'isMember', args: [account] }),
      ]);
      const ownedAssets = await publicClient.readContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'convertToAssets', args: [userShares] });
      setWalletBalance(balance); setShares(userShares); setTotalAssets(assets); setLiquidAssets(liquid); setInsuranceBalance(reserve); setIsMember(member); setShareValue(ownedAssets);
      setHasLiveData(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read Arc contract state.'); }
    finally { setLoading(false); }
  }, [chama, primaryWallet?.address]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submitDeposit() {
    setError(''); setMessage('');
    if (!chama || !primaryWallet?.address || !isEthereumWallet(primaryWallet)) { setError('Connect an EVM wallet to Arc first.'); return; }
    if (!isMember) { setError('This wallet is not an approved member of this chama yet.'); return; }
    let assets: bigint;
    try { assets = parseUnits(amount || '0', 6); } catch { setError('Enter a valid USDC amount.'); return; }
    if (assets <= BigInt(0) || assets > walletBalance) { setError('Enter a positive amount within your wallet USDC balance.'); return; }
    setBusy(true);
    try {
      await assertChamaMatchesDirectory(chama);
      await ensureWalletNetwork(primaryWallet, publicClient.chain.id);
      const client = await primaryWallet.getWalletClient();
      if (client.chain?.id !== publicClient.chain?.id) throw new Error('Wallet is not using the configured network after the switch.');
      const allowance = await publicClient.readContract({ address: chama.usdc, abi: erc20Abi, functionName: 'allowance', args: [primaryWallet.address as Address, chama.vault] });
      if (allowance < assets) {
        setMessage('Approve USDC in your wallet to continue…');
        const approval = await client.writeContract({ address: chama.usdc, abi: erc20Abi, functionName: 'approve', args: [chama.vault, assets], chain: client.chain });
        await publicClient.waitForTransactionReceipt({ hash: approval });
      }
      setMessage('Confirm the deposit in your wallet…');
      const tx = await client.writeContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'deposit', args: [assets], chain: client.chain });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      setMessage('Deposit confirmed on Arc.'); setAmount(''); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Deposit transaction failed.'); }
    finally { setBusy(false); }
  }

  let parsed = BigInt(0);
  try { parsed = parseUnits(amount || '0', 6); } catch { parsed = BigInt(0); }
  const fee = parsed / BigInt(100);
  const afterFee = parsed - fee;

  return <main className="page finance-page">
    <DepositHero/>
    <section className="section"><div className="section-head"><h2 className="section-title">Your chama position</h2><span className="pill">{chama?.name || 'Loading chama…'}</span></div>
      {!primaryWallet?.address ? <div className="card"><p className="muted">Connect your wallet to read live Arc balances and membership.</p></div> : <div className="metric-grid"><div className="metric"><WalletCards size={17} color="#16845f"/><strong>{loading ? '…' : hasLiveData ? `$${formatUsdc(walletBalance)}` : '—'}</strong><span>Wallet USDC</span></div><div className="metric"><Users size={17} color="#16845f"/><strong>{loading ? '…' : hasLiveData ? isMember ? 'Member' : 'Not approved' : '—'}</strong><span>Membership</span></div><div className="metric"><ShieldCheck size={17} color="#16845f"/><strong>{loading ? '…' : hasLiveData ? `$${formatUsdc(shareValue)}` : '—'}</strong><span>Share value</span></div></div>}
    </section>
    {chama && primaryWallet?.address && <ChamaOwnerTools chama={chama} isMember={isMember} onMembershipUpdated={() => void refresh()} onNameUpdated={updated => { setChama(updated); saveSelectedChama(updated); }}/>}
    <section className="section"><div className="section-head"><h2 className="section-title">Make a deposit</h2><button className="text-button" onClick={() => void refresh()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={15}/> : 'Refresh'}</button></div>
      <div className="card deposit-card"><label className="field-label" htmlFor="deposit-amount">Amount in USDC</label><div className="amount-input"><span>$</span><input id="deposit-amount" inputMode="decimal" type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} disabled={busy}/><span className="token-symbol">USDC</span></div><div className="deposit-breakdown"><div><span>Insurance contribution · 1%</span><strong>${formatUsdc(fee)}</strong></div><div><span>Net amount for shares</span><strong>${formatUsdc(afterFee)}</strong></div><div><span>Current cUSDC shares</span><strong>{hasLiveData ? `${formatUsdc(shares)} cUSDC` : '—'}</strong></div><div><span>Available vault liquidity</span><strong>{hasLiveData ? `$${formatUsdc(liquidAssets)}` : '—'}</strong></div><div><span>Insurance reserve</span><strong>{hasLiveData ? `$${formatUsdc(insuranceBalance)}` : '—'}</strong></div><div><span>Total pool assets</span><strong>{hasLiveData ? `$${formatUsdc(totalAssets)}` : '—'}</strong></div></div>
        <button className="primary" onClick={submitDeposit} disabled={busy || !hasLiveData || !primaryWallet?.address || !amount || !isMember}>{busy ? <><LoaderCircle className="spin" size={17}/> Processing transaction…</> : <><ArrowDownToLine size={17}/> Approve & deposit</>}</button>
        {message && <p className="feedback success"><Check size={15}/>{message}</p>}{error && <p className="feedback error">{error}</p>}
        <p className="footnote">A 1% contribution goes to the insurance fund. Final shares depend on the vault exchange rate. Transactions require wallet approval.</p>
      </div>
    </section>
  </main>;
}

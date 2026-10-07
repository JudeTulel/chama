'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { Activity, ArrowDownLeft, ArrowUpRight, ExternalLink, Landmark, LoaderCircle, RefreshCw, Wallet } from 'lucide-react';
import { formatUnits, type Address } from 'viem';
import { readSelectedChama, selectedChamaEventName } from '../src/config/selectedChama';

const ZERO = BigInt(0);
const dynamicEnvironmentReady = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);

type SerializedItem = {
  type: string; blockNumber: string; logIndex: number;
  transactionHash: string; title: string; detail: string;
  amount?: string; timestamp?: string; explorerUrl: string;
  loanId?: string; principal?: string; interest?: string;
  shares?: string; insuredAmount?: string; collateralLoss?: string;
};

function shortAddress(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function money(value?: string) {
  if (!value) return '';
  const [whole = '0', fraction = ''] = formatUnits(BigInt(value), 6).split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0').slice(0, 6)}`;
}
function when(timestamp?: string) { return timestamp ? new Date(Number(timestamp) * 1000).toLocaleString() : 'Timestamp unavailable'; }

export function ProfileActivityClient() {
  if (!dynamicEnvironmentReady) return <main className="page finance-page profile-page"><section className="section"><div className="section-head"><div><span className="eyebrow">ACCOUNT</span><h1 className="section-title">Account activity</h1></div><span className="pill">Preview mode</span></div><div className="card profile-empty"><span className="profile-icon"><Wallet size={20}/></span><div><strong>Connect a wallet to view activity</strong><p className="muted">Your deposits, withdrawals, loan requests, repayments and disbursements will appear here once a Dynamic environment is configured.</p></div></div></section></main>;
  return <ProfileActivityWallet />;
}

function ProfileActivityWallet() {
  const { primaryWallet } = useDynamicContext();
  const [chama, setChama] = useState<string | null>(null);
  // track latest fetch params so we don't re-trigger on same selection
  const [fetchKey, setFetchKey] = useState('');
  const [activity, setActivity] = useState<SerializedItem[]>([]);
  const [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cachedAt, setCachedAt] = useState('');

  useEffect(() => {
    const update = () => { setChama(readSelectedChama()?.lending || null); setActivity([]); };
    update();
    window.addEventListener(selectedChamaEventName(), update);
    return () => window.removeEventListener(selectedChamaEventName(), update);
  }, []);

  const refresh = useCallback(async () => {
    const ch = readSelectedChama();
    if (!ch || !primaryWallet?.address) { setActivity([]); return; }

    const account = primaryWallet.address as Address;
    const key = `${ch.chamaId}-${account}`;
    if (!loading) setFetchKey(key);
    else return; // already loading

    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        chamaId: ch.chamaId.toString(),
        account,
        lending: ch.lending,
        vault: ch.vault,
        directory: ch.registry,   // The deployment's directory was the selected chama's registry — we need the actual directory address
        usdc: ch.usdc,
        directoryDeploymentBlock: process.env.NEXT_PUBLIC_CHAMA_DIRECTORY_DEPLOYMENT_BLOCK || '64486284',
      });
      // override — the directory is a fixed deployment address, not per-chama
      params.set('directory', process.env.NEXT_PUBLIC_CHAMA_DIRECTORY_ADDRESS || '0x35e87026e77618fE9411F278f3870554aec6398f');

      const res = await fetch(`/api/profile-activity?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setActivity(data.events || []);
      setPartial(data.partial || false);
      setCachedAt(data.cachedAt ? `Cached ${new Date(data.cachedAt).toLocaleTimeString()}` : new Date().toLocaleTimeString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load on-chain activity.');
      setActivity([]);
    } finally { setLoading(false); }
  }, [loading]);

  useEffect(() => { if (!loading && activity.length === 0 && chama && primaryWallet?.address) void refresh(); }, [chama, primaryWallet?.address, loading]);

  // manual refresh
  const handleRefresh = useCallback(() => {
    if (!loading) { setActivity([]); void refresh(); }
  }, [loading, refresh]);

  return <main className="page finance-page profile-page">
    <section className="section">
      <div className="section-head"><div><span className="eyebrow">{chama ? 'Selected chama' : ''}</span><h1 className="section-title">Account activity</h1></div><button className="text-button" onClick={handleRefresh} disabled={loading || !primaryWallet?.address}>{loading ? <LoaderCircle className="spin" size={15}/> : <><RefreshCw size={14}/> Refresh</>}</button></div>
      {!primaryWallet?.address ? <div className="card profile-empty"><span className="profile-icon"><Wallet size={20}/></span><div><strong>Connect your wallet</strong><p className="muted">Connect to view deposits, withdrawals, loan requests, repayments and disbursements for the selected chama.</p></div></div> : <div className="card profile-wallet"><span className="profile-icon"><Wallet size={18}/></span><div><span className="eyebrow">CONNECTED WALLET</span><strong>{shortAddress(primaryWallet.address)}</strong></div><span className="pill">On-chain activity</span></div>}
      {error && <p className="feedback error">{error}</p>}
      {partial && <p className="footnote">Showing recent contract activity only: history is bounded to the latest 1M blocks, 500 loan IDs, and 200 events. Older activity may be omitted.</p>}
      {cachedAt && <p className="profile-updated">Updated {cachedAt} · Server-cached from Arc Testnet</p>}
    </section>
    {primaryWallet?.address && <section className="section"><div className="section-head"><h2 className="section-title">Transaction history</h2><span className="pill">{activity.length} events</span></div>
      {loading && activity.length === 0 ? <div className="card profile-empty"><LoaderCircle className="spin" size={18}/><p className="muted">Loading event history from server…</p></div> : activity.length === 0 ? <div className="card profile-empty"><span className="profile-icon"><Activity size={20}/></span><div><strong>No activity found</strong><p className="muted">No matching events were found in the scanned on-chain history.</p></div></div> : <div className="activity-list">{activity.map(item => {
        const outgoing = item.type === 'deposit' || item.type === 'guarantee' || item.type === 'repaid';
        const incoming = item.type === 'withdrawal' || item.type === 'interest-claimed' || item.type === 'disbursed';
        const amount = BigInt(item.amount || '0');
        return <article className="card activity-item" key={`${item.transactionHash}-${item.logIndex}`}><span className={`activity-icon ${outgoing ? 'activity-out' : ''}`}>{outgoing ? <ArrowUpRight size={18}/> : incoming ? <ArrowDownLeft size={18}/> : <Activity size={17}/>}</span><div className="activity-copy"><strong>{item.title}</strong><span>{item.detail}</span><small>Block {item.blockNumber} · {when(item.timestamp)}</small></div>{amount > ZERO && <strong className={`activity-amount ${outgoing ? 'activity-negative' : ''}`}>{money(item.amount)}</strong>}<a className="activity-link" href={item.explorerUrl} target="_blank" rel="noreferrer" aria-label={`View ${item.title} transaction`}><ExternalLink size={15}/></a></article>;
      })}</div>}
      <p className="footnote profile-footnote"><Landmark size={13}/> Deposits and withdrawals come from vault events. Loan requests, guarantees, approvals, activations/disbursements, repayments, claims and liquidations come from the selected lending contract. Disbursement amounts are matched to the corresponding loan request. Activity is loaded from a server-side cache (60s TTL) to minimize chain RPC calls.</p>
    </section>}
  </main>;
}
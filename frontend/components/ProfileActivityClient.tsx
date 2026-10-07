'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { Activity, ArrowDownLeft, ArrowUpRight, ExternalLink, Landmark, LoaderCircle, RefreshCw, Wallet } from 'lucide-react';
import { formatUnits, type Address } from 'viem';
import { chamaLendingAbi } from '../src/abi/ChamaLending';
import { chamaVaultAbi } from '../src/abi/ChamaVault';
import { chamaDirectoryAbi } from '../src/abi/ChamaDirectory';
import { addresses, directoryDeploymentBlock, publicClient, type ChamaDeployment } from '../src/config/contracts';
import { readSelectedChama, selectedChamaEventName } from '../src/config/selectedChama';
import { buildActivityFeed, getActivityScan, type ProfileActivityEvent, type ProfileActivityItem } from '../src/config/profileActivityCore';

// Scan up to 1M blocks (=~11 days on Arc testnet 1s/blocks).
// Per-window cap stays well under the 5k-block RPC limit.
const MAX_SCAN_BLOCKS = BigInt(1_000_000);
const MAX_LOAN_RECORDS = 500;
const MAX_ACTIVITY_ITEMS = 200;
// Arc RPC rejects eth_getLogs requests at the 5,000-block boundary.
// Leave a safety margin below the provider limit.
const BLOCK_WINDOW = BigInt(4_000);
const ZERO = BigInt(0);
const dynamicEnvironmentReady = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);

function shortAddress(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function money(value?: bigint) {
  if (value === undefined) return '';
  const [whole = '0', fraction = ''] = formatUnits(value, 6).split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0').slice(0, 6)}`;
}
function when(timestamp?: bigint) { return timestamp ? new Date(Number(timestamp) * 1000).toLocaleString() : 'Timestamp unavailable'; }

export function ProfileActivityClient() {
  if (!dynamicEnvironmentReady) return <main className="page finance-page profile-page"><section className="section"><div className="section-head"><div><span className="eyebrow">ACCOUNT</span><h1 className="section-title">Account activity</h1></div><span className="pill">Preview mode</span></div><div className="card profile-empty"><span className="profile-icon"><Wallet size={20}/></span><div><strong>Connect a wallet to view activity</strong><p className="muted">Your deposits, withdrawals, loan requests, repayments and disbursements will appear here once a Dynamic environment is configured.</p></div></div></section></main>;
  return <ProfileActivityWallet />;
}

function ProfileActivityWallet() {
  const { primaryWallet } = useDynamicContext();
  const [chama, setChama] = useState<ChamaDeployment | null>(null);
  const [activity, setActivity] = useState<(ProfileActivityItem & { timestamp?: bigint })[]>([]);
  const [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    const update = () => { setChama(readSelectedChama()); setActivity([]); };
    update();
    window.addEventListener(selectedChamaEventName(), update);
    return () => window.removeEventListener(selectedChamaEventName(), update);
  }, []);

  const refresh = useCallback(async () => {
    if (!chama || !primaryWallet?.address) { setActivity([]); return; }
    const account = primaryWallet.address as Address;
    setLoading(true); setError('');
    try {
      const selectedRecord = await publicClient.readContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'chamas', args: [chama.chamaId] });
      const selectedAddresses = [chama.owner, chama.usdc, chama.registry, chama.insuranceFund, chama.vault, chama.lending];
      if (selectedAddresses.some((address, index) => address.toLowerCase() !== String(selectedRecord[index]).toLowerCase()) || !selectedRecord[8]) {
        throw new Error('Selected chama does not match an active on-chain directory entry. Re-select it and refresh.');
      }
      if (chama.usdc.toLowerCase() !== addresses.usdc.toLowerCase()) throw new Error('Selected chama uses a different token than the configured USDC.');
      const [latestBlock, nextLoanId] = await Promise.all([
        publicClient.getBlockNumber(),
        publicClient.readContract({ address: chama.lending, abi: chamaLendingAbi, functionName: 'nextLoanId' }),
      ]);
      const scan = getActivityScan(directoryDeploymentBlock, latestBlock, MAX_SCAN_BLOCKS, BLOCK_WINDOW);
      const rawEvents: ProfileActivityEvent[] = [];
      for (const range of scan.ranges) {
        const [deposits, withdrawals, requests, guarantees, claims, approvals, activations, repayments, liquidations] = await Promise.all([
          publicClient.getContractEvents({ address: chama.vault, abi: chamaVaultAbi, eventName: 'Deposited', args: { member: account }, fromBlock: range.fromBlock, toBlock: range.toBlock }),
          publicClient.getContractEvents({ address: chama.vault, abi: chamaVaultAbi, eventName: 'Withdrawn', args: { member: account }, fromBlock: range.fromBlock, toBlock: range.toBlock }),
          publicClient.getContractEvents({ address: chama.lending, abi: chamaLendingAbi, eventName: 'LoanRequested', args: { borrower: account }, fromBlock: range.fromBlock, toBlock: range.toBlock }),
          publicClient.getContractEvents({ address: chama.lending, abi: chamaLendingAbi, eventName: 'Guaranteed', args: { guarantor: account }, fromBlock: range.fromBlock, toBlock: range.toBlock }),
          publicClient.getContractEvents({ address: chama.lending, abi: chamaLendingAbi, eventName: 'InterestClaimed', args: { guarantor: account }, fromBlock: range.fromBlock, toBlock: range.toBlock }),
          publicClient.getContractEvents({ address: chama.lending, abi: chamaLendingAbi, eventName: 'LoanApprovalUpdated', fromBlock: range.fromBlock, toBlock: range.toBlock }),
          publicClient.getContractEvents({ address: chama.lending, abi: chamaLendingAbi, eventName: 'LoanActivated', fromBlock: range.fromBlock, toBlock: range.toBlock }),
          publicClient.getContractEvents({ address: chama.lending, abi: chamaLendingAbi, eventName: 'Repaid', fromBlock: range.fromBlock, toBlock: range.toBlock }),
          publicClient.getContractEvents({ address: chama.lending, abi: chamaLendingAbi, eventName: 'Liquidated', fromBlock: range.fromBlock, toBlock: range.toBlock }),
        ]);
        for (const log of deposits) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'deposit', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, amount: log.args.assets ?? ZERO });
        for (const log of withdrawals) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'withdrawal', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, amount: log.args.assets ?? ZERO });
        for (const log of requests) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'loan-request', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, amount: log.args.amount ?? ZERO });
        for (const log of guarantees) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'guarantee', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, shares: log.args.shares ?? ZERO });
        for (const log of claims) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'interest-claimed', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, amount: log.args.amount ?? ZERO });
        for (const log of approvals) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: log.args.approved ? 'loan-approved' : 'loan-revoked', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO });
        for (const log of activations) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'disbursed', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, amount: ZERO });
        for (const log of repayments) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'repaid', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, principal: log.args.principal ?? ZERO, interest: log.args.interest ?? ZERO });
        for (const log of liquidations) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'liquidated', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, insuredAmount: log.args.insuredAmount ?? ZERO, collateralLoss: log.args.collateralLoss ?? ZERO });
      }

      const relatedLoanIds = new Set(rawEvents.filter(event => event.type === 'loan-request' || event.type === 'guarantee' || event.type === 'interest-claimed').map(event => event.loanId.toString()));
      const loanPrincipals = new Map<string, bigint>();
      const count = Number(nextLoanId > BigInt(MAX_LOAN_RECORDS) ? BigInt(MAX_LOAN_RECORDS) : nextLoanId);
      // Scan every loan ID from the latest range to find loans the user is involved in,
      // not just the ones directly emitted in their events.
      const firstId = nextLoanId - BigInt(count);
      const loanIds = Array.from({ length: count }, (_, index) => firstId + BigInt(index));
      for (let offset = 0; offset < loanIds.length; offset += 10) {
        const rows = await Promise.all(loanIds.slice(offset, offset + 10).map(async id => ({ id, row: await publicClient.readContract({ address: chama.lending, abi: chamaLendingAbi, functionName: 'loans', args: [id] }) })));
        for (const { id, row } of rows) {
          loanPrincipals.set(id.toString(), row[1]);
          if (row[0].toLowerCase() === account.toLowerCase()) relatedLoanIds.add(id.toString());
        }
      }
      const relevantEvents = rawEvents.filter(event => {
        if (['deposit', 'withdrawal', 'loan-request', 'guarantee', 'interest-claimed'].includes(event.type)) return true;
        return 'loanId' in event && relatedLoanIds.has(event.loanId.toString());
      });
      const requestedAmounts = new Map<string, bigint>([...loanPrincipals]);
      for (const event of relevantEvents) if (event.type === 'loan-request') requestedAmounts.set(event.loanId.toString(), event.amount);
      const completedEvents = relevantEvents.map(event => {
        if (event.type !== 'disbursed') return event;
        const amount = requestedAmounts.get(event.loanId.toString());
        return amount === undefined ? event : { ...event, amount };
      });
      const feed = buildActivityFeed(completedEvents as ProfileActivityEvent[]);
      const visibleFeed = feed.slice(0, MAX_ACTIVITY_ITEMS);
      const blockNumbers = [...new Set(visibleFeed.map(event => event.blockNumber.toString()))];
      const timestamps = await Promise.all(blockNumbers.map(async block => [block, (await publicClient.getBlock({ blockNumber: BigInt(block) })).timestamp] as const));
      const timestampByBlock = new Map(timestamps);
      setActivity(visibleFeed.map(event => ({ ...event, timestamp: timestampByBlock.get(event.blockNumber.toString()) })));
      setPartial(scan.partial || nextLoanId > BigInt(MAX_LOAN_RECORDS) || feed.length > MAX_ACTIVITY_ITEMS);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load on-chain activity.');
      setActivity([]);
    } finally { setLoading(false); }
  }, [chama, primaryWallet?.address]);

  useEffect(() => { void refresh(); }, [refresh]);

  return <main className="page finance-page profile-page">
    <section className="section">
      <div className="section-head"><div><span className="eyebrow">{chama?.name || 'Selected chama'}</span><h1 className="section-title">Account activity</h1></div><button className="text-button" onClick={() => void refresh()} disabled={loading || !primaryWallet?.address}>{loading ? <LoaderCircle className="spin" size={15}/> : <><RefreshCw size={14}/> Refresh</>}</button></div>
      {!primaryWallet?.address ? <div className="card profile-empty"><span className="profile-icon"><Wallet size={20}/></span><div><strong>Connect your wallet</strong><p className="muted">Connect to view deposits, withdrawals, loan requests, repayments and disbursements for the selected chama.</p></div></div> : <div className="card profile-wallet"><span className="profile-icon"><Wallet size={18}/></span><div><span className="eyebrow">CONNECTED WALLET</span><strong>{shortAddress(primaryWallet.address)}</strong></div><span className="pill">On-chain activity</span></div>}
      {error && <p className="feedback error">{error}</p>}
      {partial && <p className="footnote">Showing recent contract activity only: history is bounded to the latest 20,000 blocks, 200 loan IDs, and 100 events. Older activity may be omitted.</p>}
      {lastUpdated && <p className="profile-updated">Updated {lastUpdated} · Arc Testnet contract logs</p>}
    </section>
    {primaryWallet?.address && <section className="section"><div className="section-head"><h2 className="section-title">Transaction history</h2><span className="pill">{activity.length} events</span></div>
      {loading && activity.length === 0 ? <div className="card profile-empty"><LoaderCircle className="spin" size={18}/><p className="muted">Reading selected chama events…</p></div> : activity.length === 0 ? <div className="card profile-empty"><span className="profile-icon"><Activity size={20}/></span><div><strong>No activity found</strong><p className="muted">No matching events were found in the scanned on-chain history.</p></div></div> : <div className="activity-list">{activity.map(item => {
        const outgoing = item.type === 'deposit' || item.type === 'guarantee' || item.type === 'repaid';
        const incoming = item.type === 'withdrawal' || item.type === 'interest-claimed' || item.type === 'disbursed';
        return <article className="card activity-item" key={`${item.transactionHash}-${item.logIndex}`}><span className={`activity-icon ${outgoing ? 'activity-out' : ''}`}>{outgoing ? <ArrowUpRight size={18}/> : incoming ? <ArrowDownLeft size={18}/> : <Activity size={17}/>}</span><div className="activity-copy"><strong>{item.title}</strong><span>{item.detail}</span><small>Block {item.blockNumber.toString()} · {when(item.timestamp)}</small></div>{item.amount !== undefined && item.amount > ZERO && <strong className={`activity-amount ${outgoing ? 'activity-negative' : ''}`}>{money(item.amount)}</strong>}<a className="activity-link" href={item.explorerUrl} target="_blank" rel="noreferrer" aria-label={`View ${item.title} transaction`}><ExternalLink size={15}/></a></article>;
      })}</div>}
      <p className="footnote profile-footnote"><Landmark size={13}/> Deposits and withdrawals come from vault events. Loan requests, guarantees, approvals, activations/disbursements, repayments, claims and liquidations come from the selected lending contract. Disbursement amounts are matched to the corresponding loan request.</p>
    </section>}
  </main>;
}

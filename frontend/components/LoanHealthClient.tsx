'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { Activity, Check, CircleAlert, Clock3, Coins, LoaderCircle, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';
import { erc20Abi, formatUnits, parseUnits, type Address } from 'viem';
import { addresses, publicClient, subgraphUrl } from '../src/config/contracts';
import { chamaLendingAbi } from '../src/abi/ChamaLending';
import { chamaVaultAbi } from '../src/abi/ChamaVault';
import { chamaDirectoryAbi } from '../src/abi/ChamaDirectory';
import { membershipRegistryAbi } from '../src/abi/MembershipRegistry';
import { ensureWalletNetwork } from '../src/config/networkActions';
import { readSelectedChama, selectedChamaEventName } from '../src/config/selectedChama';
import type { ChamaDeployment } from '../src/config/contracts';
import { calculateBorrowingCapacity, getAdditionalGuaranteeShares, getLoanStatusLabel, getRepaymentAmount, loadSubgraphHealth, summarizeActiveLoans, type SubgraphHealth } from '../src/config/loanHealthCore';

type LoanRecord = {
  id: bigint; borrower: Address; principal: bigint; outstanding: bigint; rateBps: bigint;
  maturity: bigint; lockedShares: bigint; borrowerLockedShares: bigint; approved: boolean;
  status: number; accruedInterest: bigint; guaranteeShares: bigint; guaranteeInterest: bigint; borrowerShares: bigint;
};
type Snapshot = {
  loans: LoanRecord[]; nextId: bigint; totalAssets: bigint; liquidAssets: bigint;
  insuranceBalance: bigint; outstandingPrincipal: bigint; userShares: bigint;
  userAssets: bigint; userBalance: bigint; isMember: boolean; owner: Address;
  multiplierBps: bigint; paused: boolean; truncated: boolean;
  subgraphHealth: SubgraphHealth; subgraphCollateralAssets: bigint;
};
const MAX_LOANS_TO_READ = 25;
const ZERO = BigInt(0);
const dynamicEnvironmentReady = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);
const fmt = (value: bigint, digits = 2) => {
  const [whole = '0', fraction = ''] = formatUnits(value, 6).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(digits, '0').slice(0, digits)}`;
};
const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const secondsPerDay = BigInt(86_400);
async function assertSelectedChama(chama: ChamaDeployment) {
  const raw = await publicClient.readContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'chamas', args: [chama.chamaId] });
  const expected = [chama.owner, chama.usdc, chama.registry, chama.insuranceFund, chama.vault, chama.lending];
  if (expected.some((address, index) => address.toLowerCase() !== String(raw[index]).toLowerCase()) || !raw[8]) {
    throw new Error('Selected chama does not match an active on-chain directory entry. Re-select the chama before continuing.');
  }
  if (chama.usdc.toLowerCase() !== addresses.usdc.toLowerCase()) throw new Error('Selected chama uses a different token than the configured USDC.');
}

export function LoanHealthClient({ mode }: { mode: 'loans' | 'health' }) {
  if (!dynamicEnvironmentReady) return <WalletSetupState mode={mode} />;
  return <LoanHealthWallet mode={mode} />;
}

function WalletSetupState({ mode }: { mode: 'loans' | 'health' }) {
  const title = mode === 'loans' ? 'Loan management' : 'Chama health';
  return <main className="page finance-page loan-health-page"><section className="section"><div className="section-head"><div><span className="eyebrow">SELECTED CHAMA</span><h1 className="section-title">{title}</h1></div><span className="pill">Preview mode</span></div><div className="card"><div className="health-summary-icon"><WalletCards size={21}/></div><h2 className="section-title">Connect a wallet to continue</h2><p className="muted">This screen reads live Arc contract state and wallet permissions. Add <code>NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID</code> to <code>frontend/.env.local</code> to enable the interactive {mode} flow.</p></div></section></main>;
}

function LoanHealthWallet({ mode }: { mode: 'loans' | 'health' }) {
  const { primaryWallet } = useDynamicContext();
  const [chama, setChama] = useState<ChamaDeployment | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('12');
  const [days, setDays] = useState('90');
  const [guaranteeAmounts, setGuaranteeAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const update = () => { setChama(readSelectedChama()); setSnapshot(null); };
    update();
    window.addEventListener(selectedChamaEventName(), update);
    return () => window.removeEventListener(selectedChamaEventName(), update);
  }, []);

  const refresh = useCallback(async () => {
    if (!chama) return;
    setLoading(true); setError(''); setSnapshot(null);
    try {
      await assertSelectedChama(chama);
      const account = (primaryWallet?.address || '0x0000000000000000000000000000000000000000') as Address;
      const [nextId, totalAssets, liquidAssets, insuranceBalance, outstandingPrincipal, userShares, userBalance, isMember, owner, multiplierBps, paused] = await Promise.all([
        publicClient.readContract({ address: chama.lending, abi: chamaLendingAbi, functionName: 'nextLoanId' }),
        publicClient.readContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'totalAssets' }),
        publicClient.readContract({ address: chama.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [chama.vault] }),
        publicClient.readContract({ address: chama.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [chama.insuranceFund] }),
        publicClient.readContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'outstandingPrincipal' }),
        publicClient.readContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'balanceOf', args: [account] }),
        publicClient.readContract({ address: chama.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
        primaryWallet?.address ? publicClient.readContract({ address: chama.registry, abi: membershipRegistryAbi, functionName: 'isMember', args: [account] }) : Promise.resolve(false),
        publicClient.readContract({ address: chama.lending, abi: chamaLendingAbi, functionName: 'owner' }),
        publicClient.readContract({ address: chama.lending, abi: chamaLendingAbi, functionName: 'maxLoanMultiplierBps' }),
        publicClient.readContract({ address: chama.lending, abi: chamaLendingAbi, functionName: 'paused' }),
      ]);
      const [userAssets, subgraphHealth] = await Promise.all([
        userShares > ZERO ? publicClient.readContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'convertToAssets', args: [userShares] }) : Promise.resolve(ZERO),
        mode === 'health' ? loadSubgraphHealth(subgraphUrl, chama.chamaId) : Promise.resolve({ activeLoans: ZERO, outstandingPrincipal: ZERO, lockedShares: ZERO, borrowerLockedShares: ZERO }),
      ]);
      const collateralShares = subgraphHealth.lockedShares + subgraphHealth.borrowerLockedShares;
      const subgraphCollateralAssets = collateralShares > ZERO
        ? await publicClient.readContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'convertToAssets', args: [collateralShares] })
        : ZERO;
      const count = Number(nextId > BigInt(MAX_LOANS_TO_READ) ? BigInt(MAX_LOANS_TO_READ) : nextId);
      const first = nextId - BigInt(count);
      const loans: LoanRecord[] = [];
      for (let offset = 0; offset < count; offset += 5) {
        const ids = Array.from({ length: Math.min(5, count - offset) }, (_, i) => first + BigInt(offset + i));
        const rows = await Promise.all(ids.map(async id => {
          const row = await publicClient.readContract({ address: chama.lending, abi: chamaLendingAbi, functionName: 'loans', args: [id] });
          const [guarantee, accruedInterest, borrowerShares] = await Promise.all([
            mode === 'loans' && primaryWallet?.address ? publicClient.readContract({ address: chama.lending, abi: chamaLendingAbi, functionName: 'guarantees', args: [id, account] }) : Promise.resolve([ZERO, ZERO] as const),
            mode === 'loans' && Number(row[9]) === 1 ? publicClient.readContract({ address: chama.lending, abi: chamaLendingAbi, functionName: 'accruedInterest', args: [id] }) : Promise.resolve(ZERO),
            mode === 'loans' && Number(row[9]) === 0 ? publicClient.readContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'balanceOf', args: [row[0]] }) : Promise.resolve(ZERO),
          ]);
          return { id, borrower: row[0], principal: row[1], outstanding: row[2], rateBps: row[3], maturity: row[5], lockedShares: row[6], borrowerLockedShares: row[7], approved: row[8], status: Number(row[9]), accruedInterest, guaranteeShares: guarantee[0], guaranteeInterest: guarantee[1], borrowerShares } satisfies LoanRecord;
        }));
        loans.push(...rows);
      }
      setSnapshot({ loans: loans.reverse(), nextId, totalAssets, liquidAssets, insuranceBalance, outstandingPrincipal, userShares, userAssets, userBalance, isMember, owner, multiplierBps, paused, subgraphHealth, subgraphCollateralAssets, truncated: nextId > BigInt(MAX_LOANS_TO_READ) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the selected chama contracts.');
      setSnapshot(null);
    } finally { setLoading(false); }
  }, [chama, mode, primaryWallet?.address]);
  useEffect(() => { void refresh(); }, [refresh]);

  const activeSummary = useMemo(() => snapshot ? summarizeActiveLoans(snapshot.loans) : null, [snapshot]);
  const account = primaryWallet?.address?.toLowerCase();
  const isOwner = Boolean(account && snapshot?.owner.toLowerCase() === account);
  const pendingRequests = snapshot?.loans.filter(loan => loan.status === 0) ?? [];
  const activeLoans = snapshot?.loans.filter(loan => loan.status === 1) ?? [];

  async function send(functionName: string, args: readonly unknown[], success: string, approveAmount?: bigint): Promise<boolean> {
    setError(''); setMessage('');
    if (!chama || !primaryWallet?.address || !isEthereumWallet(primaryWallet)) { setError('Connect an EVM wallet to use loan actions.'); return false; }
    if (!snapshot?.isMember && ['requestLoan', 'guarantee', 'activate'].includes(functionName)) { setError('Only approved chama members can perform this action.'); return false; }
    if (functionName === 'approveLoan' && !isOwner) { setError('Only this lending contract’s owner can review loan requests.'); return false; }
    setBusy(true);
    try {
      await assertSelectedChama(chama);
      await ensureWalletNetwork(primaryWallet, publicClient.chain.id);
      const client = await primaryWallet.getWalletClient();
      if (client.chain?.id !== publicClient.chain.id) throw new Error('Wallet is not using the configured network.');
      if (approveAmount && approveAmount > ZERO) {
        const allowance = await publicClient.readContract({ address: chama.usdc, abi: erc20Abi, functionName: 'allowance', args: [primaryWallet.address as Address, chama.lending] });
        if (allowance < approveAmount) {
          setMessage('Approve USDC in your wallet…');
          const approvalHash = await client.writeContract({ address: chama.usdc, abi: erc20Abi, functionName: 'approve', args: [chama.lending, approveAmount], chain: client.chain });
          const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
          if (approvalReceipt.status !== 'success') throw new Error('USDC approval transaction reverted.');
        }
      }
      setMessage('Confirm the transaction in your wallet…');
      const hash = await client.writeContract({ address: chama.lending, abi: chamaLendingAbi, functionName: functionName as never, args: args as never, chain: client.chain });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('Loan transaction reverted on-chain.');
      setMessage(success); await refresh(); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Transaction failed.'); return false; }
    finally { setBusy(false); }
  }

  async function requestLoan() {
    if (!snapshot || !chama) return;
    try {
      const principal = parseUnits(amount || '0', 6);
      const rateBps = BigInt(Math.round(Number(rate) * 100));
      const durationDays = BigInt(days);
      if (principal <= ZERO || principal > snapshot.liquidAssets) throw new Error('Enter a positive amount within current vault liquidity.');
      if (principal > calculateBorrowingCapacity(snapshot.userAssets, snapshot.multiplierBps)) throw new Error('Requested amount exceeds your contract-calculated borrowing capacity.');
      if (rateBps < ZERO || rateBps > BigInt(5_000) || !Number.isFinite(Number(rate))) throw new Error('Rate must be between 0% and 50%.');
      if (durationDays <= ZERO || durationDays > BigInt(3_650)) throw new Error('Choose a term between 1 and 3,650 days.');
      const maturity = BigInt(Math.floor(Date.now() / 1000)) + durationDays * secondsPerDay;
      if (await send('requestLoan', [principal, rateBps, maturity], 'Loan request recorded on-chain.')) setAmount('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the request inputs.'); }
  }

  async function guarantee(loan: LoanRecord) {
    if (!snapshot || !chama) return;
    try {
      const shares = parseUnits(guaranteeAmounts[loan.id.toString()] || '0', 6);
      if (shares <= ZERO || shares > snapshot.userShares) throw new Error('Guarantee shares must be positive and no more than your current unlocked share balance.');
      const moreNeeded = getAdditionalGuaranteeShares(loan.principal, loan.lockedShares, loan.borrowerShares);
      if (moreNeeded === ZERO) throw new Error('This request already meets its collateral requirement.');
      if (shares > moreNeeded) throw new Error(`The request needs only ${fmt(moreNeeded)} additional cUSDC shares.`);
      if (await send('guarantee', [loan.id, shares], 'Collateral guarantee recorded on-chain.')) {
        setGuaranteeAmounts(current => ({ ...current, [loan.id.toString()]: '' }));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check guarantee amount.'); }
  }

  async function repay(loan: LoanRecord) {
    if (!chama || !snapshot) return;
    setError(''); setMessage('Checking current repayment amount…');
    try {
      const [currentLoan, currentInterest, walletBalance] = await Promise.all([
        publicClient.readContract({ address: chama.lending, abi: chamaLendingAbi, functionName: 'loans', args: [loan.id] }),
        publicClient.readContract({ address: chama.lending, abi: chamaLendingAbi, functionName: 'accruedInterest', args: [loan.id] }),
        publicClient.readContract({ address: chama.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [primaryWallet?.address as Address] }),
      ]);
      if (Number(currentLoan[9]) !== 1 || currentLoan[0].toLowerCase() !== primaryWallet?.address?.toLowerCase()) {
        throw new Error('This loan is no longer active for the connected borrower. Refresh and check its current status.');
      }
      const owed = getRepaymentAmount(currentLoan[2], currentInterest);
      if (owed > walletBalance) throw new Error(`Current repayment amount is $${fmt(owed)} including a 1-unit interest-rounding buffer; wallet balance is $${fmt(walletBalance)}.`);
      setMessage(`Repaying current balance $${fmt(owed)} including accrued interest…`);
      await send('repay', [loan.id, owed], 'Repayment confirmed; locked collateral was released.', owed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not calculate the current repayment amount.');
      setMessage('');
    }
  }

  const header = mode === 'loans' ? 'Loan management' : 'Chama health';
  return <main className="page finance-page loan-health-page">
    <section className="section">
      <div className="section-head"><div><span className="eyebrow">{chama?.name || 'Selected chama'}</span><h1 className="section-title">{header}</h1></div><button className="text-button" onClick={() => void refresh()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={15}/> : <><RefreshCw size={14}/> Refresh</>}</button></div>
      {!primaryWallet?.address ? <div className="card"><p className="muted">Connect an EVM wallet to read member actions. Live pool and loan information loads from the selected chama contracts.</p></div> : null}
      {error && <p className="feedback error"><CircleAlert size={15}/>{error}</p>}{message && <p className="feedback success"><Check size={15}/>{message}</p>}
      {snapshot && <div className="metric-grid"><div className="metric"><WalletCards size={17} color="#16845f"/><strong>${fmt(snapshot.liquidAssets)}</strong><span>Available vault liquidity</span></div><div className="metric"><Coins size={17} color="#16845f"/><strong>${fmt(snapshot.outstandingPrincipal)}</strong><span>Outstanding principal</span></div><div className="metric"><ShieldCheck size={17} color="#16845f"/><strong>${fmt(snapshot.insuranceBalance)}</strong><span>Insurance reserve</span></div></div>}
      {snapshot?.truncated && <p className="footnote">Showing the latest {MAX_LOANS_TO_READ} of {snapshot.nextId.toString()} loan IDs. Aggregate collateral coverage is withheld because this is not a complete protocol-wide scan.</p>}
    </section>

    {mode === 'health' && snapshot && activeSummary && <>
    <section className="section"><div className="card health-summary">
      <div className="health-summary-icon"><Activity size={21}/></div><div><span className="eyebrow">Solvency metric · subgraph</span><h2>{(() => { const debt = snapshot.subgraphHealth.outstandingPrincipal; return debt === ZERO ? 'No active debt' : `${Number(snapshot.subgraphCollateralAssets * BigInt(100) / debt) / 100}% coverage`; })()}</h2><p className="muted">Active loans and locked borrower/guarantor shares are aggregated by the Arc subgraph; shares are converted to current vault assets before calculating coverage.</p></div>
      </div></section>
      <section className="section"><div className="section-head"><h2 className="section-title">Live protocol inputs</h2><span className="pill">{snapshot.truncated ? 'Partial loan scan' : 'On-chain reads'}</span></div>
        <div className="metric-grid"><div className="metric"><Activity size={17} color="#16845f"/><strong>{snapshot.subgraphHealth.activeLoans.toString()}</strong><span>Active loans · subgraph</span></div><div className="metric"><Coins size={17} color="#16845f"/><strong>${fmt(snapshot.subgraphHealth.outstandingPrincipal)}</strong><span>Active debt · subgraph</span></div><div className="metric"><ShieldCheck size={17} color="#16845f"/><strong>${fmt(snapshot.subgraphCollateralAssets)}</strong><span>Locked collateral assets</span></div></div>
        <div className="card loan-health-detail"><div><span>Available vault liquidity</span><strong>${fmt(snapshot.liquidAssets)}</strong></div><div><span>Insurance reserve balance</span><strong>${fmt(snapshot.insuranceBalance)}</strong></div><div><span>Coverage formula</span><strong>Locked collateral ÷ active debt</strong></div></div>
        <p className="footnote">The Graph supplies the aggregate active-loan and collateral view. Direct contract reads remain authoritative for vault liquidity, insurance balance, transactions, and permission checks.</p>
      </section>
    </>}

    {mode === 'loans' && snapshot && <>
      <section className="section"><div className="section-head"><h2 className="section-title">Request a loan</h2><span className="pill">{snapshot.isMember ? 'Member verified' : 'Member only'}</span></div>
        <div className="card deposit-card"><p className="muted">Borrowing capacity is calculated from your live cUSDC share value and the contract multiplier ({(Number(snapshot.multiplierBps) / 100).toFixed(2)}×). Owner approval, collateral guarantees, and your activation are still required.</p>
          <label className="field-label" htmlFor="loan-amount">Principal · USDC</label><div className="amount-input"><span>$</span><input id="loan-amount" type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" disabled={busy}/><span className="token-symbol">USDC</span></div>
          <div className="deposit-breakdown"><div><span>Your live borrowing capacity</span><strong>${fmt(calculateBorrowingCapacity(snapshot.userAssets, snapshot.multiplierBps))}</strong></div><div><span>Current vault liquidity</span><strong>${fmt(snapshot.liquidAssets)}</strong></div></div>
          <div className="loan-input-grid"><label>Annual interest rate (%)<input className="input" type="number" min="0" max="50" step="0.01" value={rate} onChange={event => setRate(event.target.value)} disabled={busy}/></label><label>Term (days)<input className="input" type="number" min="1" max="3650" step="1" value={days} onChange={event => setDays(event.target.value)} disabled={busy}/></label></div>
          <button className="primary" onClick={() => void requestLoan()} disabled={busy || loading || !snapshot.isMember || snapshot.paused || !amount}>{busy ? <LoaderCircle className="spin" size={16}/> : <Clock3 size={16}/>} Submit loan request</button>{snapshot.paused && <p className="feedback error">Lending is paused on-chain.</p>}
        </div>
      </section>
      <section className="section"><div className="section-head"><h2 className="section-title">Pending requests</h2>{isOwner && <span className="pill">Owner review</span>}</div>
        {pendingRequests.length === 0 ? <div className="card"><p className="muted">No pending loan requests in the loaded on-chain records.</p></div> : <div className="loan-list">{pendingRequests.map(loan => {
          const borrower = loan.borrower.toLowerCase() === account;
          const additional = getAdditionalGuaranteeShares(loan.principal, loan.lockedShares, loan.borrowerShares);
          return <article className="card loan-card" key={loan.id.toString()}><div className="loan-card-head"><div><span className="pill">Loan #{loan.id.toString()} · Pending</span><h3>{fmt(loan.principal)} USDC</h3><p className="muted">Borrower {shortAddress(loan.borrower)} · {(Number(loan.rateBps) / 100).toFixed(2)}% APR</p></div><span className="loan-status">{loan.approved ? 'Approved' : 'Awaiting owner'}</span></div>
            <div className="deposit-breakdown"><div><span>Maturity</span><strong>{new Date(Number(loan.maturity) * 1000).toLocaleDateString()}</strong></div><div><span>More collateral required*</span><strong>{fmt(additional)} cUSDC</strong></div></div>
            {!borrower && snapshot.isMember && additional > ZERO && <div className="loan-action-inline"><input className="input" aria-label={`Guarantee shares for loan ${loan.id}`} type="number" min="0" step="0.01" placeholder="cUSDC shares" value={guaranteeAmounts[loan.id.toString()] || ''} onChange={event => setGuaranteeAmounts(current => ({ ...current, [loan.id.toString()]: event.target.value }))}/><button className="secondary" disabled={busy || snapshot.paused || !guaranteeAmounts[loan.id.toString()]} onClick={() => void guarantee(loan)}>Guarantee</button></div>}
            {isOwner && <div className="loan-action-inline"><button className="primary" disabled={busy || loan.approved} onClick={() => void send('approveLoan', [loan.id, true], 'Loan approved on-chain.')}>Approve</button><button className="secondary" disabled={busy || !loan.approved} onClick={() => void send('approveLoan', [loan.id, false], 'Loan approval revoked on-chain.')}>Revoke approval</button></div>}
            {borrower && loan.approved && <button className="primary" disabled={busy || snapshot.paused || additional > ZERO} onClick={() => void send('activate', [loan.id], 'Loan activated and disbursed on-chain.')}>Activate & receive loan</button>}
            <p className="footnote">* Contract activation checks borrower shares plus guarantor shares against requested principal. {additional === ZERO ? 'Collateral requirement appears met.' : 'Only guarantee shares where you accept the collateral-lock and liquidation risk.'}</p>
          </article>;
        })}</div>}
      </section>
      <section className="section"><div className="section-head"><h2 className="section-title">Active loans</h2></div>
        {activeLoans.length === 0 ? <div className="card"><p className="muted">No active loan records in the loaded on-chain range.</p></div> : <div className="loan-list">{activeLoans.map(loan => {
          const borrower = loan.borrower.toLowerCase() === account;
          const myGuarantee = loan.guaranteeShares;
          return <article className="card loan-card" key={loan.id.toString()}><div className="loan-card-head"><div><span className="pill">Loan #{loan.id.toString()} · Active</span><h3>{fmt(loan.outstanding)} USDC outstanding</h3><p className="muted">Borrower {shortAddress(loan.borrower)} · maturity {new Date(Number(loan.maturity) * 1000).toLocaleDateString()}</p></div><span className="loan-status">{(Number(loan.rateBps) / 100).toFixed(2)}% APR</span></div>
            <div className="deposit-breakdown"><div><span>Accrued interest (live contract view)</span><strong>${fmt(loan.accruedInterest)}</strong></div><div><span>Total repayment amount</span><strong>${fmt(loan.outstanding + loan.accruedInterest)}</strong></div>{myGuarantee > ZERO && <div><span>Your locked guarantee shares</span><strong>{fmt(myGuarantee)} cUSDC</strong></div>}</div>
            {borrower && <button className="primary" disabled={busy || snapshot.paused || loan.outstanding + loan.accruedInterest > snapshot.userBalance} onClick={() => void repay(loan)}>Approve USDC & repay in full</button>}
            {myGuarantee > ZERO && loan.guaranteeInterest > ZERO && <button className="secondary" disabled={busy} onClick={() => void send('claimGuaranteeInterest', [loan.id], 'Guarantor interest claimed.')}>Claim ${fmt(loan.guaranteeInterest)} guarantee interest</button>}
            {BigInt(Math.floor(Date.now() / 1000)) > loan.maturity + BigInt(86_400) && <button className="secondary" disabled={busy} onClick={() => void send('liquidate', [loan.id], 'Loan liquidation recorded on-chain.')}>Liquidate overdue loan</button>}
            {!borrower && myGuarantee === ZERO && <p className="footnote">Collateral is locked while the loan is active. Liquidation becomes available after maturity plus the contract’s one-day grace period.</p>}
          </article>;
        })}</div>}
      </section>
      <section className="section"><div className="section-head"><h2 className="section-title">Loan history</h2></div><div className="loan-list">{snapshot.loans.filter(loan => loan.status >= 2).slice(0, 25).map(loan => <article className="card history-row" key={loan.id.toString()}><span className="pill">#{loan.id.toString()} · {getLoanStatusLabel(loan.status)}</span><strong>{fmt(loan.principal)} USDC</strong><span className="muted">{shortAddress(loan.borrower)}</span>{loan.guaranteeInterest > ZERO && <button className="secondary" disabled={busy} onClick={() => void send('claimGuaranteeInterest', [loan.id], 'Guarantor interest claimed.')}>Claim ${fmt(loan.guaranteeInterest)} interest</button>}</article>)}{snapshot.loans.every(loan => loan.status < 2) && <div className="card"><p className="muted">Completed loan records will appear here when available.</p></div>}</div></section>
      <p className="footnote">Actions are submitted to the selected chama’s contracts. Contract checks remain authoritative. A guarantee locks cUSDC shares and those shares can be lost on liquidation. Only the lending contract owner can approve; liquidation is permissionless after maturity plus the contract’s one-day grace period.</p>
    </>}
    {snapshot && mode === 'health' && activeSummary && <p className="footnote">{snapshot.truncated ? 'This view includes only a bounded recent scan. No aggregate coverage percentage is reported.' : 'All loan IDs currently exposed by nextLoanId() were checked for active status and collateral.'} Data refreshes from Arc when this page loads or Refresh is pressed.</p>}
    {loading && !snapshot && <p className="muted">Reading live contract data…</p>}
  </main>;
}

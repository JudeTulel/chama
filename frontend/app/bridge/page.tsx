'use client';

import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  LoaderCircle,
  Wallet,
} from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { getSwapQuote, executeSwapTransaction, getSwapStatus } from '@dynamic-labs-sdk/client';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// Source = Base (where the MiniSend onramp lands USDC).
// Destination = Arc (the chama chain, matching NEXT_PUBLIC_CHAIN_ID in .env.example).
const BASE = { chain: 'EVM' as const, networkId: '8453' as const, chainId: 8453, label: 'Base' };
const ARC = { chain: 'EVM' as const, networkId: '5042' as const, chainId: 5042, label: 'Arc (chama)' };

export default function BridgePage() {
  const { primaryWallet } = useDynamicContext();
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<'idle' | 'quoting' | 'ready' | 'executing' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [submitHash, setSubmitHash] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function getQuote() {
    if (!primaryWallet?.address) {
      setError('Connect a wallet on the profile page to use the bridge.');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('Enter a USDC amount to bridge.');
      return;
    }
    setError('');
    setStatus('quoting');
    try {
      const quoteRes = await getSwapQuote({
        from: {
          address: primaryWallet.address,
          chain: BASE.chain,
          networkId: BASE.networkId,
          tokenAddress: USDC,
          amount: parseUnits(amount, 6).toString(),
        },
        to: {
          address: primaryWallet.address,
          chain: ARC.chain,
          networkId: ARC.networkId,
          tokenAddress: USDC,
        },
        slippage: 0.005,
      });
      setQuote(quoteRes);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quote failed. Check your Dynamic environment and chain settings.');
      setStatus('idle');
    }
  }

  async function executeBridge() {
    if (!quote?.signingPayload) {
      setError('No quote ready. Click "Get quote" first.');
      return;
    }
    if (!primaryWallet?.address) {
      setError('Connect a wallet first.');
      return;
    }
    setSubmitting(true);
    setError('');
    setStatus('executing');
    try {
      const { transactionHash } = await executeSwapTransaction({
        walletAccount: {
          address: primaryWallet.address,
          chain: BASE.chain,
          networkId: BASE.networkId,
          tokenAddress: USDC,
        },
        signingPayload: quote.signingPayload,
      });
      setSubmitHash(transactionHash);
      let attempts = 0;
      const timer = setInterval(async () => {
        attempts += 1;
        const st = await getSwapStatus({
          txHash: transactionHash as string,
          from: { chain: BASE.chain, networkId: BASE.networkId },
          to: { chain: ARC.chain, networkId: ARC.networkId },
        });
        if (st.status === 'completed' || st.status === 'failed' || attempts > 40) {
          clearInterval(timer);
          setStatus(st.status);
          setSubmitting(false);
        }
      }, 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Execution failed.');
      setStatus('error');
      setSubmitting(false);
    }
  }

  return (
    <main className="page finance-page">
      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">DYNAMIC BRIDGE</span>
            <h1 className="section-title">Bridge USDC to your Arc chama</h1>
          </div>
          <Link href="/onramp" className="text-button">Back to onramp</Link>
        </div>

        {status === 'idle' && !primaryWallet?.address && (
          <div className="card">
            <span className="profile-icon"><Wallet size={20} /></span>
            <div>
              <strong>Connect a wallet to bridge USDC to Arc.</strong>
              <p className="muted">The connected wallet stays connected on the profile page and is used for the cross-chain swap.</p>
            </div>
          </div>
        )}

        {status === 'idle' && primaryWallet?.address && (
          <div className="card">
            <div className="metric-grid">
              <div className="metric">
                <Wallet size={17} color="#16845f" />
                <strong>{shortAddress(primaryWallet.address)}</strong>
                <span>Connected wallet</span>
              </div>
              <div className="metric">
                <strong>{ARC.label}</strong>
                <span>Destination: Arc chama chain</span>
              </div>
              <div className="metric">
                <strong>{BASE.label}</strong>
                <span>Source: Base (from the onramp)</span>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <label className="field-label">Amount (USDC)</label>
              <div className="amount-input">
                <span>$</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  autoComplete="off"
                  style={{ flex: 1 }}
                />
                <span className="token-symbol">USDC</span>
              </div>
              <button className="primary" onClick={getQuote} disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={16} /> : <ArrowRightLeft size={16} />} Get quote
              </button>
            </div>
          </div>
        )}

        {status === 'quoting' && (
          <div className="card">
            <LoaderCircle className="spin" size={18} />
            <p className="muted">Getting the cross-chain quote…</p>
          </div>
        )}

        {status === 'ready' && quote && (
          <div className="card">
            <div className="metric-grid">
              <div className="metric">
                <strong>≈ {quoteToAmount(quote)}</strong>
                <span>Est. USDC on Arc</span>
              </div>
              <div className="metric">
                <strong>{quoteExecutionTime(quote)}</strong>
                <span>Est. execution</span>
              </div>
              <div className="metric">
                <strong>{quoteFee(quote)}</strong>
                <span>Est. fee</span>
              </div>
            </div>
            <p className="footnote">{quoteDetail(quote)}</p>
            <div style={{ marginTop: 16 }}>
              <button className="primary" onClick={executeBridge} disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={16} /> : <ArrowRightLeft size={16} />} Bridge now
              </button>
              <p className="footnote">Execution is signed in your Dynamic wallet. A pending swap on Base settles USDC to your Arc wallet.</p>
            </div>
          </div>
        )}

        {status === 'executing' && (
          <div className="card">
            <LoaderCircle className="spin" size={18} />
            <p className="muted">Bridging USDC from Base to Arc…</p>
          </div>
        )}

        {status === 'done' && (
          <div className="card">
            <CheckCircle2 size={20} />
            <div>
              <strong>Swap completed.</strong>
              <p className="muted">USDC received on Arc. Check your wallet on the profile page.</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="card">
            <p className="feedback error" style={{ margin: 0 }}>{error}</p>
          </div>
        )}
      </section>
    </main>
  );
}

function quoteToAmount(q: Record<string, unknown>) {
  const v = (key: string) => q[key];
  const raw = v('toTokenAmount');
  if (typeof raw !== 'string') return '—';
  try {
    return formatUnits(BigInt(raw), 6);
  } catch {
    return raw;
  }
}

function quoteExecutionTime(q: Record<string, unknown>) {
  const v = (key: string) => q[key];
  const raw = v('expectedExecutionTime');
  if (typeof raw !== 'string') return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '—';
  const minutes = n / 60;
  if (minutes < 1) return `${Math.round(n)}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${Math.round(minutes / 60)}h`;
}

function quoteFee(q: Record<string, unknown>) {
  const fee = q['fee'];
  if (typeof fee !== 'string') return '—';
  try {
    return formatUnits(BigInt(fee), 6);
  } catch {
    return fee;
  }
}

function quoteDetail(q: Record<string, unknown>) {
  const d = q['detail'];
  return typeof d === 'string' ? d : 'Cross-chain swap from Base to Arc.';
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
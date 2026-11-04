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
import { createClient, getQuote } from '@lifi/sdk';

// Source = Base (where the MiniSend onramp lands USDC).
// Destination = Arc (the chama chain, NEXT_PUBLIC_CHAIN_ID=5042).
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const BASE: { chainId: number; networkId: string; label: string; explorer: string } = {
  chainId: 8453,
  networkId: '8453',
  label: 'Base',
  explorer: 'https://basescan.org',
};
const ARC: { chainId: number; networkId: string; label: string; explorer: string } = {
  chainId: 5042,
  networkId: '5042',
  label: 'Arc (chama)',
  explorer: 'https://explorer.arc.io',
};

// Integrator name shown to LI.FI; a unique string so fees go to our org.
const INTEGRATOR = 'chama-app';

export default function BridgePage() {
  const { primaryWallet } = useDynamicContext();
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [status, setStatus] = useState<
    'idle' | 'quoting' | 'ready' | 'executing' | 'done' | 'error'
  >('idle');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function requestQuote() {
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
      // Gasless quote: LI.FI returns a signable step (EIP-712 batched call)
      // and a relay fee itemised in the quote, so the user spends no Base gas.
      const client = createClient({ integrator: INTEGRATOR });
      const _quote = await getQuote(client, {
        fromChain: BASE.chainId,
        toChain: ARC.chainId,
        fromToken: USDC,
        toToken: USDC,
        fromAmount: parseUnits(amount, 6).toString(),
        fromAddress: primaryWallet.address,
        slippage: 0.005,
        // Lenders will have no native token; gasless is the capital-free path.
        gasless: true,
      });
      setQuote(_quote);
      setStatus('ready');
    } catch (e: any) {
      setError(
        e?.data?.message ||
          e?.message ||
          'Quote failed — check your Linked LI.FI key and wallet conneciton.',
      );
      setStatus('idle');
    }
  }

  async function executeBridge() {
    if (!quote) {
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
      // Pull the signable step from the gasless quote and ask the user to sign.
      // On acceptance LI.FI relays the batched call and pays gas with the relay
      // fee deducted from the input token (no Base balance required from you).
      const client = createClient({ integrator: INTEGRATOR });
      const step = await getQuote(client, {
        fromChain: BASE.chainId,
        toChain: ARC.chainId,
        fromToken: USDC,
        toToken: USDC,
        fromAmount: parseUnits(amount, 6).toString(),
        fromAddress: primaryWallet.address,
        slippage: 0.005,
        gasless: true,
      });

      // Sign the EIP-712 typed data with the connected wallet.
      // The ethereum provider (MetaMask / Dynamic) is a browser global without
      // a bundled type, so cast the window to the known shape.
      const eth = (window as any).ethereum;
      if (!eth || typeof eth.request !== 'function') {
        throw new Error('No wallet provider found. Connect a wallet in your browser.');
      }
      const signature = await eth.request({
        method: 'eth_signTypedData_v4',
        params: [
          primaryWallet.address,
          JSON.stringify(step.typedData?.[0] || step.typedData),
        ],
      });

      const relayBody = {
        ...step,
        typedData: [{ ...step.typedData?.[0], signature }],
      };

      const res = await fetch('https://li.quest/v1/advanced/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(relayBody),
      });
      const body = await res.json();
      if (!res.ok || !body.data?.taskId) {
        throw new Error(body?.error?.message || 'Relay rejected.');
      }
      const taskId = body.data.taskId;

      // Poll until DONE / FAILED (accounts for a relayed tx that may take a while).
      let attempts = 0;
      const timer = setInterval(async () => {
        attempts += 1;
        try {
          const st = await (
            await fetch(`https://li.quest/v1/status?taskId=${taskId}`, {
              headers: { 'Content-Type': 'application/json' },
            })
          ).json();
          if (st.status === 'DONE' || st.status === 'FAILED' || attempts > 60) {
            clearInterval(timer);
            setStatus(st.status);
            setSubmitting(false);
            // Show a success/failure card with the task hash we persisted.
            setQuote({ taskId, status: st.status, ...quote, applied: true });
          }
        } catch (e) {
          if (attempts > 60) {
            clearInterval(timer);
            setStatus('error');
            setSubmitting(false);
          }
        }
      }, 5000);

      // Owner-facing success immediately after relay accepted.
      setStatus('ready');
      // Note: the bridge completes on-chain asynchronously; the polling card
      // below shows the live task status.
      setQuote({ taskId, status: 'PENDING', ...quote, applied: true });
    } catch (e: any) {
      setError(e?.message || 'Execution failed.');
      setStatus('error');
      setSubmitting(false);
    }
  }

  return (
    <main className="page finance-page">
      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">LIFI BRIDGE</span>
            <h1 className="section-title">Bridge USDC to Arc chama</h1>
          </div>
          <Link href="/onramp" className="text-button">
            Back to onramp
          </Link>
        </div>

        {status === 'idle' && !primaryWallet?.address && (
          <div className="card">
            <span className="profile-icon">
              <Wallet size={20} />
            </span>
            <div>
              <strong>Connect a wallet to bridge USDC to Arc.</strong>
              <p className="muted">
                The connected wallet stays connected on the profile page. With
                LI.FI gasless the wallet pays no Base gas — LI.FI relays the
                signed payload.
              </p>
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
              <button
                className="primary"
                onClick={requestQuote}
                disabled={submitting}
              >
                {submitting ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <ArrowRightLeft size={16} />
                )}
                Get quote
              </button>
            </div>
          </div>
        )}

        {status === 'quoting' && (
          <div className="card">
            <LoaderCircle className="spin" size={18} />
            <p className="muted">Getting the cross-chain quote (gasless)…</p>
          </div>
        )}

        {status === 'ready' && quote && (
          <div className="card">
            <div className="metric-grid">
              <div className="metric">
                <strong>From</strong>
                <span>
                  {amount} USDC on {BASE.label}
                </span>
              </div>
              <div className="metric">
                <strong>To (est.)</strong>
                <span>
                  ≈ {quote.toAmount
                    ? formatUnits(BigInt(quote.toAmount), 6)
                    : '—'}{' '}
                  USDC on Arc
                </span>
              </div>
              <div className="metric">
                <strong>Relay fee</strong>
                <span>
                  {quote.relayFee
                    ? formatUnits(BigInt(quote.relayFee), 6)
                    : '0'}{' '}
                  USDC
                </span>
              </div>
            </div>
            {quote.detail && (
              <p className="footnote">{quote.detail}</p>
            )}
            <div style={{ marginTop: 16 }}>
              <button
                className="primary"
                onClick={executeBridge}
                disabled={submitting}
              >
                {submitting ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <ArrowRightLeft size={16} />
                )}
                Bridge now
              </button>
              <p className="footnote">
                No Base balance needed: you sign a single off-chain payload and
                LI.FI relays it, paying the relay fee from your USDC. Execution
                is tracked on the task below.
              </p>
            </div>
          </div>
        )}

        {quote?.applied && quote.taskId && (
          <div className="card">
            {status === 'ready' ? (
              <>
                <CheckCircle2 size={20} />
                <div>
                  <strong>Relay accepted.</strong>
                  <p className="muted">
                    LI.FI will execute on-chain; progress is tracked by task{' '}
                    <code>{quote.taskId.substring(0, 10)}…</code>. No gas is
                    charged to you beyond the relay fee in your USDC.
                  </p>
                </div>
              </>
            ) : status === 'executing' ? (
              <div className="card">
                <LoaderCircle className="spin" size={18} />
                <p className="muted">
                  Bridging USDC from Base to Arc… (task{' '}
                  <code style={{ margin: '0 4px' }}>
                    {quote.taskId?.substring(0, 10)}…
                  </code>
                  )
                </p>
              </div>
            ) : status === 'done' ? (
              <div className="card">
                <CheckCircle2 size={20} />
                <div>
                  <strong>Bridge completed.</strong>
                  <p className="muted">
                    USDC received on Arc. Check your wallet on the profile page.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {status === 'error' && (
          <div className="card">
            <p className="feedback error" style={{ margin: 0 }}>
              {error}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

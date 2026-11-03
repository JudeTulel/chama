'use client';

import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, LoaderCircle, Wallet } from 'lucide-react';

const ONRAMP_URL = 'https://app.minisend.xyz';

export default function OnrampPage() {
  const { primaryWallet } = useDynamicContext();
  const [iframeSrc, setIframeSrc] = useState(ONRAMP_URL);
  const [status, setStatus] = useState<'loading' | 'ready' | 'no-wallet'>('loading');

  useEffect(() => {
    if (!primaryWallet?.address) {
      setStatus('no-wallet');
      setIframeSrc(ONRAMP_URL);
      return;
    }
    // Pass the wallet connected on the profile page into Minisend so the
    // iframe keeps the same address connected.
    setIframeSrc(
      `${ONRAMP_URL}?wallet=${encodeURIComponent(primaryWallet.address)}` +
      `&walletAddress=${encodeURIComponent(primaryWallet.address)}`
    );
    setStatus('ready');
  }, [primaryWallet?.address]);

  return (
    <main className="page finance-page">
      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">MINISEND ONRAMP</span>
            <h1 className="section-title">Bring USDC to Base</h1>
          </div>
          <Link href="/profile" className="text-button">Back to profile</Link>
        </div>

        {status === 'no-wallet' ? (
          <div className="card">
            <span className="profile-icon"><Wallet size={20} /></span>
            <div>
              <strong>Connect a wallet on the profile page to keep it linked in the onramp.</strong>
              <p className="muted">The wallet connected on the profile page is passed to Minisend in the iframe so your address stays connected.</p>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="metric-grid">
              <div className="metric">
                <Wallet size={17} color="#16845f" />
                <strong>{primaryWallet ? shortAddress(primaryWallet.address) : '—'}</strong>
                <span>Connected wallet passed to Minisend</span>
              </div>
              <div className="metric">
                <strong>Base</strong>
                <span>USDC lands on Base after the onramp</span>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
              The onramp below embeds Minisend so you can fund USDC and have it settle on
              Base. Your connected wallet address is passed to the iframe.
            </p>
            <div
              className="card"
              style={{
                position: 'relative', padding: 0, overflow: 'hidden',
                border: '1px solid var(--line)', borderRadius: 16,
              }}
            >
              <iframe
                title="Minisend onramp"
                src={iframeSrc}
                style={{
                  width: '100%', height: 780, minHeight: 600, border: 0,
                  borderRadius: 16, overflow: 'hidden', background: '#000',
                }}
                allow="payment"
                loading="lazy"
              />
            </div>
            <p className="footnote" style={{ marginTop: 12 }}>
              Minisend onramp: buy or fund USDC and have it land on Base.{' '}
              <a href="https://minisend.xyz" target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> minisend.xyz
              </a>
            </p>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <Link href="/bridge" className="primary">
                <ArrowRightLeft size={16} /> Next: Bridge USDC to Arc chama
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
import { ArrowRightLeft } from 'lucide-react';
/* eslint-enable @typescript-eslint/no-unused-vars */

import Link from 'next/link';
import { ProfileActivityClient } from '../../components/ProfileActivityClient';
import { Wallet, ArrowRightLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  return (
    <main className="page finance-page profile-page">
      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">ACCOUNT</span>
            <h1 className="section-title">Account activity</h1>
          </div>
        </div>
        <ProfileActivityClient />
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">ONRAMP &amp; BRIDGE</span>
            <h2 className="section-title">Bring USDC to Arc</h2>
          </div>
        </div>
        <div className="card">
          <div className="action">
            <div className="action-label">
              <Wallet size={16} />
              <span>Onramp USDC to Base</span>
            </div>
            <Link href="/onramp" className="primary">
              <ArrowRightLeft size={16} /> Onramp
            </Link>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            Fund USDC on Base via Minisend, then bridge it across to your Arc chama.
          </p>
        </div>
      </section>
    </main>
  );
}

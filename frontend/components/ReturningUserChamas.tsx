'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, LoaderCircle, RefreshCw, Users } from 'lucide-react';
import type { Address } from 'viem';
import { discoverWalletChamas, type DiscoveredWalletChama } from '../src/config/chamaDiscovery';
import { saveSelectedChama } from '../src/config/selectedChama';

export function ReturningUserChamas({ walletAddress, onSelect }: { walletAddress: Address; onSelect: () => void }) {
  const [chamas, setChamas] = useState<DiscoveredWalletChama[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setChamas(await discoverWalletChamas(walletAddress)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load your chamas.'); }
    finally { setLoading(false); }
  }, [walletAddress]);
  useEffect(() => { void refresh(); }, [refresh]);

  return <section className="returning-chamas section" aria-labelledby="returning-chamas-title">
    <div className="section-head">
      <div><span className="eyebrow">WELCOME BACK</span><h2 className="section-title" id="returning-chamas-title">Your chamas</h2></div>
      <button className="text-button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh your chamas">{loading ? <LoaderCircle className="spin" size={15}/> : <RefreshCw size={15}/>} Refresh</button>
    </div>
    {loading ? <div className="card returning-chamas-state"><LoaderCircle className="spin" size={19}/> Finding chamas for this wallet…</div>
      : error ? <div className="card returning-chamas-state"><p className="feedback error">{error}</p><button className="secondary" onClick={() => void refresh()}>Try again</button></div>
      : chamas.length === 0 ? <div className="card returning-chamas-empty"><span className="choice-icon"><Users size={19}/></span><div><strong>No chamas found for this wallet</strong><p className="muted">Create one or join with an invite link. Once you’re approved, it will appear here.</p></div></div>
      : <div className="returning-chama-list">{chamas.map(chama => <button className="card returning-chama" key={chama.chamaId.toString()} onClick={() => { saveSelectedChama(chama.deployment); onSelect(); }}>
        <span className="choice-icon"><Users size={19}/></span><span className="returning-chama-info"><strong>{chama.name || `Chama #${chama.chamaId}`}</strong><small>{chama.role} · {chama.active ? 'Active' : 'Inactive'}</small></span><span className="pill">{chama.role}</span><ArrowRight size={17}/>
      </button>)}</div>}
  </section>;
}

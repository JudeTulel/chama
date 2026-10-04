'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { LoaderCircle } from 'lucide-react';
import { publicClient } from '../../src/config/contracts';
import { chamaDirectoryAbi } from '../../src/abi/ChamaDirectory';
import { ChamaOwnerTools } from '../../components/ChamaOwnerTools';
import { readSelectedChama, saveSelectedChama, selectedChamaEventName } from '../../src/config/selectedChama';
import type { ChamaDeployment } from '../../src/config/contracts';
import type { Address } from 'viem';

const registryReadAbi = [{ type: 'function', name: 'isMember', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'bool' }] }] as const;

export default function ManagePage() {
  const { primaryWallet } = useDynamicContext();
  const [chama, setChama] = useState<ChamaDeployment | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const update = () => setChama(readSelectedChama());
    update();
    window.addEventListener(selectedChamaEventName(), update);
    return () => window.removeEventListener(selectedChamaEventName(), update);
  }, []);

  const refresh = useCallback(async () => {
    if (!chama || !primaryWallet?.address) return;
    setLoading(true); setError('');
    try {
      const member = await publicClient.readContract({
        address: chama.registry,
        abi: registryReadAbi,
        functionName: 'isMember',
        args: [primaryWallet.address as Address],
      });
      setIsMember(member);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read membership status.');
    } finally {
      setLoading(false);
    }
  }, [chama, primaryWallet?.address]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!chama) {
    return <main className="page finance-page">
      <section className="section">
        <div className="card">
          <h1 className="section-title">No chama selected</h1>
          <p className="muted">Go to Home and join or create a chama first.</p>
        </div>
      </section>
    </main>;
  }

  return <main className="page finance-page">
    <section className="section">
      <div className="section-head">
        <h1 className="section-title">Manage chama</h1>
        <span className="pill">{chama.name || 'Unnamed chama'}</span>
      </div>
      {loading && <p className="muted"><LoaderCircle className="spin" size={15}/> Loading membership status…</p>}
      {error && <p className="feedback error">{error}</p>}
    </section>
    <ChamaOwnerTools
      chama={chama}
      isMember={isMember}
      onMembershipUpdated={() => void refresh()}
      onNameUpdated={updated => { setChama(updated); saveSelectedChama(updated); }}
    />
  </main>;
}
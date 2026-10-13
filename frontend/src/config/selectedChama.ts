import type { Address } from 'viem';
import type { ChamaDeployment } from './contracts';

const zero = '0x0000000000000000000000000000000000000000' as Address;
const selectedStorageKey = 'chama.selectedDeployment';
const selectionEvent = 'chama:selection-changed';

export const defaultChama: ChamaDeployment = {
  chamaId: BigInt(0),
  owner: (process.env.NEXT_PUBLIC_DEFAULT_CHAMA_OWNER || '0x67352B92EA3a8B38eAF93ca91BD108e7c29B6dd7') as Address,
  usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000') as Address,
  registry: (process.env.NEXT_PUBLIC_DEFAULT_REGISTRY_ADDRESS || '0xdb2f578a50b676869840b970dffe9a2f7a695b11') as Address,
  insuranceFund: (process.env.NEXT_PUBLIC_DEFAULT_INSURANCE_ADDRESS || '0xbddd5bd4b7765f626305285f64622b1391e193a5') as Address,
  vault: (process.env.NEXT_PUBLIC_DEFAULT_VAULT_ADDRESS || '0xcb3fba43b4d6a617ee6723b603adc2abac697eb4') as Address,
  lending: (process.env.NEXT_PUBLIC_DEFAULT_LENDING_ADDRESS || '0xb0643e16da0c1681f055bb9999618e248b504286') as Address,
  name: 'Chama',
  metadataURI: '',
  active: true,
  acceptingMembers: true,
};

export function readSelectedChama(): ChamaDeployment {
  if (typeof window === 'undefined') return defaultChama;
  try {
    const raw = window.localStorage.getItem(selectedStorageKey);
    if (!raw) return defaultChama;
    const selected = JSON.parse(raw) as Omit<ChamaDeployment, 'chamaId'> & { chamaId: string };
    if (!selected.registry || !selected.vault || !selected.lending) return defaultChama;
    return { ...selected, chamaId: BigInt(selected.chamaId) };
  } catch {
    return defaultChama;
  }
}

export function saveSelectedChama(chama: ChamaDeployment) {
  if (typeof window === 'undefined') return;
  const serializable = { ...chama, chamaId: chama.chamaId.toString() };
  window.localStorage.setItem(selectedStorageKey, JSON.stringify(serializable));
  window.dispatchEvent(new Event(selectionEvent));
}

export function selectedChamaEventName() {
  return selectionEvent;
}

export const emptyChamaAddress = zero;

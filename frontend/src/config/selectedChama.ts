import type { Address } from 'viem';
import type { ChamaDeployment } from './contracts';

const zero = '0x0000000000000000000000000000000000000000' as Address;
const selectedStorageKey = 'chama.selectedDeployment';
const selectionEvent = 'chama:selection-changed';

export const defaultChama: ChamaDeployment = {
  chamaId: BigInt(0),
  owner: (process.env.NEXT_PUBLIC_DEFAULT_CHAMA_OWNER || '0x67352B92EA3a8B38eAF93ca91BD108e7c29B6dd7') as Address,
  usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000') as Address,
  registry: (process.env.NEXT_PUBLIC_DEFAULT_REGISTRY_ADDRESS || '0xeea3897842f62f6cca3264914788b35834be6b29') as Address,
  insuranceFund: (process.env.NEXT_PUBLIC_DEFAULT_INSURANCE_ADDRESS || '0x1bf4ca174204f1ffb4b28bde0d26802fc5ced587') as Address,
  vault: (process.env.NEXT_PUBLIC_DEFAULT_VAULT_ADDRESS || '0x540ccf5860a32134278487e3aaba44c4ebdeb8de') as Address,
  lending: (process.env.NEXT_PUBLIC_DEFAULT_LENDING_ADDRESS || '0xa11bd4b30af0d1c5390484b3deabc4db7d4c9dfe') as Address,
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

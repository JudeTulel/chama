import type { Address } from 'viem';
import type { ChamaDeployment } from './contracts';

const zero = '0x0000000000000000000000000000000000000000' as Address;
const selectedStorageKey = 'chama.selectedDeployment';
const selectionEvent = 'chama:selection-changed';

export const defaultChama: ChamaDeployment = {
  chamaId: BigInt(0),
  owner: zero,
  usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000') as Address,
  registry: zero,
  insuranceFund: zero,
  vault: zero,
  lending: zero,
  name: '',
  metadataURI: '',
  active: false,
  acceptingMembers: false,
};

export function isChamaSelected(chama: ChamaDeployment): boolean {
  return chama.vault !== zero && chama.lending !== zero && chama.registry !== zero;
}

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

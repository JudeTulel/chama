export type ChamaCandidate = {
  chamaId: bigint;
  owner: string;
  isMember: boolean;
  active: boolean;
  name: string;
  registry: string;
};

export type WalletChama = ChamaCandidate & { role: 'Owner' | 'Member' };
export type DiscoveredWalletChama = WalletChama & { deployment: import('./contracts').ChamaDeployment };

export function classifyWalletChamas(wallet: string, candidates: ChamaCandidate[]): WalletChama[] {
  const normalizedWallet = wallet.toLowerCase();
  return candidates
    .filter(chama => chama.owner.toLowerCase() === normalizedWallet || chama.isMember)
    .map(chama => ({ ...chama, role: chama.owner.toLowerCase() === normalizedWallet ? 'Owner' : 'Member' }));
}

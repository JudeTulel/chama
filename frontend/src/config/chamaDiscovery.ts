import { addresses, publicClient, type ChamaDeployment } from './contracts';
import { chamaDirectoryAbi } from '../abi/ChamaDirectory';
import { membershipRegistryAbi } from '../abi/MembershipRegistry';
import { classifyWalletChamas, type DiscoveredWalletChama } from './chamaDiscoveryCore';
export { classifyWalletChamas } from './chamaDiscoveryCore';
export type { ChamaCandidate, WalletChama, DiscoveredWalletChama } from './chamaDiscoveryCore';

export async function discoverWalletChamas(wallet: string): Promise<DiscoveredWalletChama[]> {
  const count = await publicClient.readContract({
    address: addresses.directory,
    abi: chamaDirectoryAbi,
    functionName: 'nextChamaId',
  });
  const deployments: ChamaDeployment[] = [];

  for (let start = BigInt(0); start < count; start += BigInt(20)) {
    const batchSize = count - start > BigInt(20) ? BigInt(20) : count - start;
    const ids = Array.from({ length: Number(batchSize) }, (_, i) => start + BigInt(i));
    const records = await Promise.all(ids.map(chamaId => publicClient.readContract({
      address: addresses.directory,
      abi: chamaDirectoryAbi,
      functionName: 'chamas',
      args: [chamaId],
    })));
    for (const [index, record] of records.entries()) {
      const [owner, usdc, registry, insuranceFund, vault, lending, name, metadataURI, active, acceptingMembers] = record;
      if (registry === '0x0000000000000000000000000000000000000000') continue;
      deployments.push({ chamaId: ids[index], owner, usdc, registry, insuranceFund, vault, lending, name, metadataURI, active, acceptingMembers });
    }
  }

  const candidates = await Promise.all(deployments.map(async chama => {
    const isMember = await publicClient.readContract({
      address: chama.registry,
      abi: membershipRegistryAbi,
      functionName: 'isMember',
      args: [wallet as `0x${string}`],
    });
    return { chamaId: chama.chamaId, owner: chama.owner, isMember, active: chama.active, name: chama.name, registry: chama.registry, deployment: chama };
  }));

  const matching = new Set(classifyWalletChamas(wallet, candidates).map(chama => chama.chamaId));
  return candidates
    .filter(chama => matching.has(chama.chamaId))
    .map(({ deployment, ...chama }) => ({ ...chama, role: chama.owner.toLowerCase() === wallet.toLowerCase() ? 'Owner' : 'Member', deployment }));
}

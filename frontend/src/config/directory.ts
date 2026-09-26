import { getAddress, keccak256, stringToHex } from 'viem';
import { publicClient, addresses, type ChamaDeployment } from './contracts';
import { chamaDirectoryAbi } from '../abi/ChamaDirectory';

export async function resolveInvite(code: string): Promise<ChamaDeployment> {
  const invite = await publicClient.readContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'invites', args: [keccak256(stringToHex(code.trim()))] });
  const data = invite as readonly [bigint, bigint, bigint, bigint, boolean];
  if (!data[4]) throw new Error('Invite is inactive, expired, or fully used.');
  const raw = await publicClient.readContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'chamas', args: [data[0]] });
  const c = raw as readonly [string, string, string, string, string, string, string, string, boolean, boolean];
  return { chamaId: data[0], owner: getAddress(c[0]), usdc: getAddress(c[1]), registry: getAddress(c[2]), insuranceFund: getAddress(c[3]), vault: getAddress(c[4]), lending: getAddress(c[5]), name: c[6], metadataURI: c[7], active: c[8], acceptingMembers: c[9] };
}

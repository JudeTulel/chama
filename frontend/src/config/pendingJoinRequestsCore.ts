import { createPublicClient, http, getAddress, type Address } from 'viem';
import { arc } from './contracts';
import { chamaDirectoryAbi } from '../abi/ChamaDirectory';

export type JoinRequestLog = {
  applicant: `0x${string}`;
  createdAt: bigint;
  processed: boolean;
};

export type PendingJoinRequest = {
  applicant: `0x${string}`;
  createdAt: bigint;
};

type SubgraphJoinRequest = { applicant: string; createdAt: string; processed: boolean };

export async function loadPendingJoinRequests(endpoint: string, chamaId: bigint): Promise<PendingJoinRequest[]> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'query PendingJoinRequests($chamaId: ID!) { joinRequests(where: { chama: $chamaId, processed: false }, orderBy: createdAt, orderDirection: asc) { applicant createdAt processed } }',
      variables: { chamaId: chamaId.toString() },
    }),
  });
  if (!response.ok) throw new Error(`Subgraph request failed (${response.status}).`);
  const payload = await response.json() as { data?: { joinRequests?: SubgraphJoinRequest[] }; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'Subgraph query failed.');
  return (payload.data?.joinRequests || []).map(request => ({ applicant: request.applicant as `0x${string}`, createdAt: BigInt(request.createdAt) }));
}

export type BlockRange = { fromBlock: bigint; toBlock: bigint };

export function getPendingRequestBlockRanges(startBlock: bigint, latestBlock: bigint, blockWindow = BigInt(5_000)): BlockRange[] {
  if (blockWindow <= BigInt(0)) throw new Error('Block window must be positive.');
  const ranges: BlockRange[] = [];
  for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += blockWindow) {
    const toBlock = fromBlock + blockWindow - BigInt(1) < latestBlock
      ? fromBlock + blockWindow - BigInt(1)
      : latestBlock;
    ranges.push({ fromBlock, toBlock });
  }
  return ranges;
}

export function collectPendingJoinRequests(requests: JoinRequestLog[]): PendingJoinRequest[] {
  return requests
    .filter(request => request.createdAt !== BigInt(0))
    .filter(request => !request.processed)
    .map(({ applicant, createdAt }) => ({ applicant, createdAt }))
    .sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
}

// ---- RPC log-scan loader (no subgraph required) ----
export const DIRECTORY_DEPLOYMENT_BLOCK = BigInt(process.env.NEXT_PUBLIC_CHAMA_DIRECTORY_DEPLOYMENT_BLOCK || '25697486');
const BLOCK_WINDOW = BigInt(5_000);
const MAX_SCAN_BLOCKS = BigInt(2_000_000);

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.mainnet.arc.io';
const scanClient = createPublicClient({ chain: arc, transport: http(rpcUrl, { retryCount: 3, retryDelay: 1_000, timeout: 30_000 }) });

export async function loadPendingJoinRequestsFromRpc(
  directoryAddress: Address,
  chamaId: bigint,
  startBlock: bigint = DIRECTORY_DEPLOYMENT_BLOCK,
  latestBlock?: bigint,
): Promise<PendingJoinRequest[]> {
  const directory = getAddress(directoryAddress);
  const head = latestBlock ?? await scanClient.getBlockNumber();
  const available = head >= startBlock ? head - startBlock + BigInt(1) : BigInt(0);
  const scanCount = available < MAX_SCAN_BLOCKS ? available : MAX_SCAN_BLOCKS;
  const fromBlock = scanCount === BigInt(0) ? startBlock : head - scanCount + BigInt(1);

  const requested = new Map<string, bigint>();
  const processed = new Set<string>();

  for (let cursor = fromBlock; cursor <= head; cursor += BLOCK_WINDOW) {
    const candidate = cursor + BLOCK_WINDOW - BigInt(1);
    const toBlock = candidate < head ? candidate : head;
    const [reqLogs, procLogs] = await Promise.all([
      scanClient.getContractEvents({ address: directory, abi: chamaDirectoryAbi, eventName: 'JoinRequested', fromBlock: cursor, toBlock }),
      scanClient.getContractEvents({ address: directory, abi: chamaDirectoryAbi, eventName: 'JoinProcessed', fromBlock: cursor, toBlock }),
    ]);
    for (const log of reqLogs) {
      if (log.args?.chamaId !== chamaId || !log.args?.applicant) continue;
      if (!log.blockNumber) continue;
      const key = log.args.applicant.toLowerCase();
      requested.set(key, BigInt(log.blockNumber));
    }
    for (const log of procLogs) {
      if (log.args?.chamaId !== chamaId || !log.args?.applicant) continue;
      processed.add(log.args.applicant.toLowerCase());
    }
  }

  return collectPendingJoinRequests(
    [...requested.entries()].map(([applicant, createdAt]) => ({
      applicant: applicant as `0x${string}`,
      createdAt,
      processed: processed.has(applicant),
    })),
  );
}

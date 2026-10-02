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

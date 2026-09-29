export type JoinRequestLog = {
  applicant: `0x${string}`;
  createdAt: bigint;
  processed: boolean;
};

export type PendingJoinRequest = {
  applicant: `0x${string}`;
  createdAt: bigint;
};

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

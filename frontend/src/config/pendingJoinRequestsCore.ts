export type JoinRequestLog = {
  applicant: `0x${string}`;
  createdAt: bigint;
  processed: boolean;
};

export type PendingJoinRequest = {
  applicant: `0x${string}`;
  createdAt: bigint;
};

export function collectPendingJoinRequests(requests: JoinRequestLog[]): PendingJoinRequest[] {
  return requests
    .filter(request => request.createdAt !== BigInt(0))
    .filter(request => !request.processed)
    .map(({ applicant, createdAt }) => ({ applicant, createdAt }))
    .sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
}

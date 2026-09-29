import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPendingJoinRequests, getPendingRequestBlockRanges } from './pendingJoinRequestsCore.ts';

const applicantA = '0x00000000000000000000000000000000000000AA';
const applicantB = '0x00000000000000000000000000000000000000BB';

test('filters processed join requests from current per-applicant state', () => {
  const pending = collectPendingJoinRequests([
    { applicant: applicantA, createdAt: BigInt(10), processed: false },
    { applicant: applicantB, createdAt: BigInt(20), processed: true },
  ]);

  assert.deepEqual(pending, [{ applicant: applicantA, createdAt: BigInt(10) }]);
});

test('returns pending requests in creation order', () => {
  const pending = collectPendingJoinRequests([
    { applicant: applicantA, createdAt: BigInt(30), processed: false },
    { applicant: applicantB, createdAt: BigInt(20), processed: false },
  ]);

  assert.deepEqual(pending.map(request => request.applicant), [applicantB, applicantA]);
});

test('scans request events from deployment block in bounded contiguous ranges', () => {
  assert.deepEqual(
    getPendingRequestBlockRanges(BigInt(100), BigInt(10_101), BigInt(5_000)),
    [
      { fromBlock: BigInt(100), toBlock: BigInt(5_099) },
      { fromBlock: BigInt(5_100), toBlock: BigInt(10_099) },
      { fromBlock: BigInt(10_100), toBlock: BigInt(10_101) },
    ],
  );
});

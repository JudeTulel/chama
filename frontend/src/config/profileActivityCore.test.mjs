import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActivityFeed, getActivityScan } from './profileActivityCore.ts';

test('limits history scan to latest configured window and marks older history partial', () => {
  const scan = getActivityScan(1000n, 125001n, 50000n, 5000n);
  assert.deepEqual({ fromBlock: scan.fromBlock, toBlock: scan.toBlock, partial: scan.partial }, { fromBlock: 75002n, toBlock: 125001n, partial: true });
  assert.equal(scan.ranges.length, 10);
  assert.deepEqual(scan.ranges[0], { fromBlock: 75002n, toBlock: 80001n });
  assert.deepEqual(scan.ranges[9], { fromBlock: 120002n, toBlock: 125001n });
});

test('does not mark history partial when the full available deployment range fits', () => {
  const scan = getActivityScan(1000n, 4000n, 50000n, 5000n);
  assert.deepEqual({ fromBlock: scan.fromBlock, toBlock: scan.toBlock, partial: scan.partial }, { fromBlock: 1000n, toBlock: 4000n, partial: false });
  assert.deepEqual(scan.ranges, [{ fromBlock: 1000n, toBlock: 4000n }]);
});

test('sorts events newest first and formats transaction details and explorer links', () => {
  const activity = buildActivityFeed([
    { type: 'deposit', blockNumber: 12n, logIndex: 0, transactionHash: '0xabc', amount: 2_500_000n },
    { type: 'repaid', blockNumber: 15n, logIndex: 1, transactionHash: '0xdef', loanId: 3n, principal: 1_000_000n, interest: 50_000n },
    { type: 'disbursed', blockNumber: 15n, logIndex: 0, transactionHash: '0xghi', loanId: 2n, amount: 900_000n },
  ]);
  assert.deepEqual(activity.map(item => item.type), ['repaid', 'disbursed', 'deposit']);
  assert.equal(activity[0].title, 'Loan repayment · #3');
  assert.equal(activity[0].detail, 'Principal 1 · interest 0.05 USDC');
  assert.equal(activity[0].amount, 1_050_000n);
  assert.equal(activity[0].explorerUrl, 'https://explorer.testnet.arc.io/tx/0xdef');
});

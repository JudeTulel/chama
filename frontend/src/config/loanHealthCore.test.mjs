import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBorrowingCapacity, getAdditionalGuaranteeShares, getLoanStatusLabel, summarizeActiveLoans } from './loanHealthCore.ts';

test('calculates borrowing capacity from live member assets and contract multiplier', () => {
  assert.equal(calculateBorrowingCapacity(BigInt(125_000_000), BigInt(30_000)), BigInt(375_000_000));
});

test('maps every on-chain loan enum to a readable label', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(getLoanStatusLabel), ['Pending', 'Active', 'Repaid', 'Defaulted', 'Liquidated']);
  assert.equal(getLoanStatusLabel(99), 'Unknown');
});

test('computes remaining guarantee shares using the contract collateral rule', () => {
  assert.equal(getAdditionalGuaranteeShares(BigInt(100_000_000), BigInt(20_000_000), BigInt(30_000_000)), BigInt(50_000_000));
  assert.equal(getAdditionalGuaranteeShares(BigInt(100_000_000), BigInt(70_000_000), BigInt(50_000_000)), BigInt(0));
});

test('summarizes only active debt and collateral from live loan records', () => {
  assert.deepEqual(summarizeActiveLoans([
    { outstanding: BigInt(60), lockedShares: BigInt(20), borrowerLockedShares: BigInt(10), status: 1 },
    { outstanding: BigInt(90), lockedShares: BigInt(30), borrowerLockedShares: BigInt(0), status: 0 },
    { outstanding: BigInt(10), lockedShares: BigInt(5), borrowerLockedShares: BigInt(5), status: 2 },
  ]), { activeLoans: 1, activeDebt: BigInt(60), activeLockedShares: BigInt(30) });
});

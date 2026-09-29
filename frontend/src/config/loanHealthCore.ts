export type LoanStatus = 0 | 1 | 2 | 3 | 4;
export type LoanForHealth = { outstanding: bigint; lockedShares: bigint; borrowerLockedShares: bigint; status: number };

export function calculateBorrowingCapacity(memberAssetValue: bigint, multiplierBps: bigint): bigint {
  return memberAssetValue * multiplierBps / BigInt(10_000);
}

export function getAdditionalGuaranteeShares(principal: bigint, alreadyGuaranteedShares: bigint, borrowerShares: bigint): bigint {
  const borrowerCollateral = borrowerShares < principal ? borrowerShares : principal;
  const covered = alreadyGuaranteedShares + borrowerCollateral;
  return covered >= principal ? BigInt(0) : principal - covered;
}

export function summarizeActiveLoans(loans: LoanForHealth[]) {
  return loans.reduce((total, loan) => loan.status !== 1 ? total : {
    activeLoans: total.activeLoans + 1,
    activeDebt: total.activeDebt + loan.outstanding,
    activeLockedShares: total.activeLockedShares + loan.lockedShares + loan.borrowerLockedShares,
  }, { activeLoans: 0, activeDebt: BigInt(0), activeLockedShares: BigInt(0) });
}

export function getLoanStatusLabel(status: number): string {
  return ['Pending', 'Active', 'Repaid', 'Defaulted', 'Liquidated'][status] ?? 'Unknown';
}

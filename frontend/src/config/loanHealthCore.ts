export type LoanStatus = 0 | 1 | 2 | 3 | 4;
export type LoanForHealth = { outstanding: bigint; lockedShares: bigint; borrowerLockedShares: bigint; status: number };

export function calculateBorrowingCapacity(memberAssetValue: bigint, multiplierBps: bigint): bigint {
  return memberAssetValue * multiplierBps / BigInt(10_000);
}

export function getRepaymentAmount(outstanding: bigint, currentInterest: bigint): bigint {
  return outstanding + currentInterest + BigInt(1);
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
export type SubgraphHealth = {
  activeLoans: bigint;
  outstandingPrincipal: bigint;
  lockedShares: bigint;
  borrowerLockedShares: bigint;
};

export async function loadSubgraphHealth(endpoint: string, chamaId: bigint): Promise<SubgraphHealth> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'query ChamaHealth($chamaId: ID!) { loans(where: { chama: $chamaId, status: 1 }) { outstanding lockedShares borrowerLockedShares } }',
      variables: { chamaId: chamaId.toString() },
    }),
  });
  if (!response.ok) throw new Error(`Health subgraph request failed (${response.status}).`);
  const payload = await response.json() as { data?: { loans?: Array<{ outstanding: string; lockedShares: string; borrowerLockedShares: string }> }; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'Health subgraph query failed.');
  const loans = payload.data?.loans || [];
  return loans.reduce((summary, loan) => ({
    activeLoans: summary.activeLoans + BigInt(1),
    outstandingPrincipal: summary.outstandingPrincipal + BigInt(loan.outstanding),
    lockedShares: summary.lockedShares + BigInt(loan.lockedShares),
    borrowerLockedShares: summary.borrowerLockedShares + BigInt(loan.borrowerLockedShares),
  }), { activeLoans: BigInt(0), outstandingPrincipal: BigInt(0), lockedShares: BigInt(0), borrowerLockedShares: BigInt(0) });
}
DeFi SACCO / Chama Protocol  
White Paper & Smart Contract Architecture  
Version 1.0 | September 2026

Abstract

This document presents a complete architectural design for a decentralized Savings and Credit Cooperative (SACCO) / Chama protocol. The system enables members to pool savings, borrow against those savings under collateralized and multiplier rules, and earn yield from interest paid by borrowers. Guarantors are incentivized through a preferential share of interest. The design faithfully translates the proven Kenyan SACCO model into a transparent, automated, on-chain mutual finance system while remaining modular and upgradeable.

1. Introduction & Motivation

Traditional Kenyan SACCOs and informal chamas allow members to pool savings and access affordable loans (typically 2–4× their deposits) with interest flowing back to depositors as dividends and deposit interest. These systems rely on trust, guarantors, and mutual accountability.

A DeFi implementation can improve:
Transparency and automated accounting
Continuous interest accrual and distribution
Programmable rules and governance
Reduced operational friction
Global accessibility (subject to regulation)

The protocol described here implements exactly this model on-chain.

2. Core Principles

Member-owned shared liquidity pool
Savings (share tokens) serve as primary collateral and ownership claim
Loans limited by a multiplier of member deposits + optional additional collateral
Interest paid by borrowers is distributed preferentially to guarantors and then to the general pool
Democratic governance via membership shares
Strong risk controls (over-collateralization, liquidation, insurance fund)

3. High-Level System Architecture

Modular Contract Layout

| Contract                    | Primary Responsibility                                      |
|----------------------------|-------------------------------------------------------------|
| MembershipToken (Share)    | Issues and tracks member ownership shares                   |
| Vault                      | Holds assets, manages deposits/withdrawals, accounting      |
| LendingModule              | Loan origination, debt tracking, repayment, interest        |
| CollateralManager          | Locks/unlocks shares & external collateral, liquidations    |
| GuarantorModule            | Manages guarantees and preferential interest allocation     |
| YieldDistributor           | Splits and distributes interest to guarantors and pool      |
| Governance (DAO)           | Parameter control, upgrades, emergency actions              |
| OracleAdapter              | Price feeds for collateral valuation                        |
| Treasury / InsuranceFund   | Protocol fees and default protection                        |

The system follows a modular “core + plugins” pattern for upgradeability.

4. Key Mechanisms

4.1 Membership & Shares
Users deposit assets into the Vault and receive share tokens (ERC-20 or ERC-4626 style).
Shares represent both ownership and primary collateral.
Shares may be non-transferable or have restricted transferability to preserve the cooperative nature.

4.2 Borrowing
Maximum loan = Member’s share value × maxLoanMultiplier (governance-set, typically 2–4×).
Additional external collateral can increase borrowing power.
Guarantors can lock their own shares to support a loan.

4.3 Guarantor Incentives (Core Feature)
Interest paid by a borrower is split as follows (parameters adjustable by governance):

Guarantor Share**: 40–60% of net interest → distributed pro-rata to the guarantors of that specific loan according to the amount they locked.
General Pool Share**: 30–50% → increases the value of all share tokens or is distributed to all depositors.
Protocol / Insurance Fee**: 5–15% → Treasury and Insurance Fund.

This preferential yield compensates guarantors for the risk of potential loss of their locked shares.

Additional optional incentives:
One-time or ongoing guarantee fee paid by the borrower
Reputation score that improves future borrowing terms
Priority access or higher personal multipliers for successful guarantors

4.4 Interest Accrual & Distribution
Continuous or index-based accrual.
On every repayment (or periodically):
  Calculate accrued interest
  Deduct protocol fee
  Allocate guarantor share
  Remaining interest accrues to the Vault (raising share price) or is made claimable

4.5 Liquidation
If a loan’s collateral ratio falls below the liquidation threshold, anyone may liquidate.
Liquidator repays debt and receives discounted collateral.
Shortfalls are covered first by the Insurance Fund, then socialized.

5. Main User Flows

Deposit  
User deposits assets → receives shares → shares become collateral base.

Request Loan + Guarantees  
Borrower specifies amount → system checks multiplier limit → guarantors lock shares → loan is disbursed from the Vault.

Repayment  
Borrower pays principal + interest → interest is split (guarantors first) → collateral is released proportionally.

Guarantee  
Member locks shares against a specific loan → begins earning preferential interest share → locks are released on full repayment or after notice period.

Liquidation  
Undercollateralized or overdue loan → liquidator acts → guarantors may lose part of locked value.
6. Governance Parameters (Examples)
maxLoanMultiplier (e.g. 300 = 3×)
guarantorInterestShareBps (e.g. 5000 = 50%)
poolInterestShareBps
liquidationThreshold
minCollateralRatio
Guarantee lock-up / notice periods

7. Security Considerations

Oracle redundancy and deviation checks
Withdrawal queues or time-locks for large exits
8. Technology Recommendations
Solidity + Foundry
OpenZeppelin (ERC-4626, Governor, AccessControl, ReentrancyGuard)
Optional: Account Abstraction for improved UX
Deployment on a low-fee L2 recommended for accessibility
9. Regulatory & Practical Notes

10. Conclusion
The proposed architecture delivers a fully on-chain, transparent, and incentive-aligned version of the classic SACCO/chama model. By giving guarantors a meaningful preferential share of interest, the system creates strong economic motivation for mutual support while preserving the cooperative spirit of shared ownership and shared risk.


End of Document

You can copy the entire text above and save it as a .md file (e.g., DeFi-SACCO-Chama-Architecture.md).  

Would you like me to expand any section (more detailed function signatures, mathematical formulas for interest, threat model, or a minimal MVP scope)?The modular design allows iterative development: start with a single-asset MVP focused on deposits, multiplier lending, and basic guarantor interest sharing, then expand governance, multi-asset support, and advanced reputation features.

This architecture is a technical design only. In many jurisdictions (including Kenya), accepting deposits and making loans is a regulated activity. Legal structuring, potential licensing, KYC/AML considerations, and local cooperative law compliance are essential before any real-world deployment.


Chainlink (or equivalent) oracles


Thorough audits and bug bounty before mainnet
Insurance Fund funded by protocol fees
Circuit breakers / pause functionality
Formal verification of core accounting and interest math
Reentrancy guards and standard access control

All major parameters are controlled by the DAO (membership-share weighted voting + timelock).
Interest rate model parameters (base rate + utilization curve)
protocolFeeBps



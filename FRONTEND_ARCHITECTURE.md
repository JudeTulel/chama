# Chama Frontend Architecture

## Status

This is the frontend design for the current single-asset USDC chama contracts. No Next.js application has been created yet.

The frontend will use Next.js App Router and interact directly with the Arc EVM contracts through the connected wallet. The blockchain is the source of truth for balances, shares, loans, guarantees, approvals, repayments, and liquidation state.

## Product scope

The frontend supports:

- One USDC asset on Arc.
- ERC-20 `cUSDC` cooperative shares.
- Member allowlisting.
- Deposits and withdrawals.
- Loan requests.
- Owner approval or rejection of loan requests.
- Multiple guarantors per loan.
- Loan activation and wallet disbursement.
- Full repayment.
- Guarantor interest claims.
- Insurance fund visibility.
- Loan liquidation visibility and owner risk controls.
- Chama solvency and health reporting.

The first frontend should not represent the system as a bank account. It should clearly show that transactions require wallet signatures and that balances are read from Arc.

## Recommended stack

- Next.js App Router.
- TypeScript.
- Tailwind CSS.
- wagmi for wallet and contract hooks.
- viem for public-client reads and transaction encoding.
- RainbowKit or another wallet connection layer.
- TanStack Query through wagmi for cache and refetching.
- Zod for environment validation.
- Recharts or a small SVG chart layer for health metrics.

## Route map

```text
/                         Landing page and connect wallet
/dashboard                Member overview
/deposit                   Deposit USDC and receive cUSDC shares
/withdraw                  Withdraw liquid USDC by burning cUSDC shares
/loans                     Loan list with filters and statuses
/loans/new                 Create a loan request
/loans/[id]                Loan detail, collateral, guarantors, actions
/guarantees                Guarantees supplied by the connected member
/claims                    Claimable guarantor interest
/health                    Chama solvency and insurance metrics
/members                   Owner-only membership administration
/admin/loans               Owner-only loan approval queue
/admin/risk                Owner-only protocol parameters and pause controls
/settings                  Network, wallet, contract addresses, and transaction history
```

## Screens

### 1. Landing page

Purpose:

- Explain the chama model.
- Show Arc network and USDC asset.
- Connect a wallet.
- Link to risk, insurance, and legal disclosures.

Primary actions:

- Connect wallet.
- Switch to configured Arc chain.
- View public chama statistics.

### 2. Dashboard

Show:

- Connected wallet address.
- Member status.
- USDC wallet balance.
- cUSDC share balance.
- Estimated share value in USDC.
- Available withdrawal liquidity.
- Active borrowed principal.
- Locked borrower collateral.
- Supplied guarantee collateral.
- Claimable guarantor interest.
- Insurance fund balance.
- Chama health status.

The dashboard must distinguish wallet USDC from deposited USDC and locked shares.

### 3. Deposit

Flow:

1. Read wallet USDC balance.
2. User enters USDC amount.
3. Display the 1% deposit insurance fee.
4. Display net deposit value used for cUSDC shares.
5. User approves the USDC token if allowance is insufficient.
6. User submits `ChamaVault.deposit(assets)`.
7. Wait for confirmation.
8. Refetch USDC, cUSDC, total assets, and insurance balance.

Display example:

```text
Deposit                  100.00 USDC
Insurance contribution     1.00 USDC
Shares minted             99.00 cUSDC
```

### 4. Withdraw

Flow:

1. Read cUSDC balance and share conversion.
2. Read liquid USDC available in the Vault.
3. User enters the USDC amount to withdraw.
4. Show required cUSDC shares.
5. Block withdrawals when the amount exceeds liquid vault USDC.
6. Submit `ChamaVault.withdraw(assets)`.
7. Refetch balances after confirmation.

The UI must not imply that outstanding principal is immediately withdrawable.

### 5. Loan request

Fields:

- Amount in USDC.
- Annual interest rate in basis points.
- Maturity date.

Preflight reads:

- Member status.
- cUSDC balance.
- Share value.
- Maximum loan capacity.
- Current vault liquid liquidity.
- Current health status.

After submission:

- Show status `Pending approval`.
- Show request ID.
- Explain that the owner must approve the request before activation.
- Explain that guarantees can be supplied while pending.

### 6. Loan approval queue

Owner-only screen.

Table columns:

- Loan ID.
- Borrower.
- Amount.
- Rate.
- Maturity.
- Borrower shares.
- Current guarantee coverage.
- Required coverage.
- Health status at request.
- Approval status.

Actions:

- Approve: `approveLoan(id, true)`.
- Reject: `approveLoan(id, false)`.
- Open loan details.

Approval must require a wallet signature from the chama owner. The frontend must not call activation automatically after approval.

### 7. Loan detail

Show:

- Loan status.
- Borrower.
- Principal.
- Outstanding principal.
- Interest rate.
- Created time.
- Maturity time.
- Approval state.
- Borrower locked shares.
- Total guarantor shares.
- Guarantor list and each locked amount.
- Estimated accrued interest.
- Insurance coverage setting.
- Repayment amount.

Context-sensitive actions:

- Owner: approve or reject pending loan.
- Member: guarantee pending approved or unapproved loan if permitted by contract state.
- Borrower: activate approved loan once collateral is sufficient.
- Borrower: repay active loan.
- Guarantor: claim interest after repayment.
- Any wallet: liquidate after maturity plus grace period.

The UI must always show that activation transfers USDC to the borrower's wallet.

### 8. Guarantees

Show:

- Loans guaranteed by the connected wallet.
- cUSDC currently locked.
- Percentage of each loan's guarantee pool.
- Estimated guarantor interest.
- Risk status and maturity.
- Claimable balance.

Each guarantee should clearly state that locked shares may be burned during liquidation.

### 9. Health dashboard

Show the solvency formula from the contracts README:

```text
liquidAssets = max(totalAssets - debtStock, 0)

riskAdjustedRecoveryRatio =
  (liquidAssets
   + insuranceBalance
   + 90% * borrowerCollateralValue
   + 75% * guarantorCollateralValue)
  / debtStock
```

Show:

- Total assets.
- Outstanding debt stock.
- Liquid assets.
- Insurance balance.
- Borrower collateral.
- Guarantor collateral.
- Recovery ratio.
- Insurance coverage ratio.
- Debt-to-assets ratio.
- Liquidity coverage ratio.
- Health band: Healthy, Watch, Stressed, or Critical.

When debt is zero, show `No debt / solvent by construction` and display ratios as `N/A`.

Important limitation: the current contracts do not expose a complete global borrower-collateral and guarantor-collateral aggregate. The first frontend can show the values indexed from loan events and mark the health result as an estimate until a view function or indexer is added.

### 10. Owner risk screen

Show and manage:

- Pause/unpause controls where available.
- Maximum loan multiplier.
- Guarantor interest share.
- Pool share.
- Treasury fee.
- Insurance interest contribution.
- Insurance liquidation coverage.
- Treasury address.
- Membership allowlist.

Risk parameter changes require explicit confirmation showing old and new values.

## Contract integration model

Use one typed contract configuration per deployment:

```ts
export const contracts = {
  membershipRegistry: {
    address: env.NEXT_PUBLIC_MEMBERSHIP_REGISTRY_ADDRESS,
    abi: membershipRegistryAbi,
  },
  insuranceFund: {
    address: env.NEXT_PUBLIC_INSURANCE_FUND_ADDRESS,
    abi: insuranceFundAbi,
  },
  vault: {
    address: env.NEXT_PUBLIC_CHAMA_VAULT_ADDRESS,
    abi: chamaVaultAbi,
  },
  lending: {
    address: env.NEXT_PUBLIC_CHAMA_LENDING_ADDRESS,
    abi: chamaLendingAbi,
  },
  usdc: {
    address: env.NEXT_PUBLIC_USDC_ADDRESS,
    abi: erc20Abi,
  },
} as const;
```

The Factory is needed for creating new chamas, not for ordinary member operations:

```ts
factory: {
  address: env.NEXT_PUBLIC_CHAMA_FACTORY_ADDRESS,
  abi: chamaFactoryAbi,
}
```

## ABI policy

Do not hand-write production ABIs. Generate them from Foundry artifacts after every contract change.

Source artifacts:

```text
contracts/out/MembershipRegistry.sol/MembershipRegistry.json
contracts/out/InsuranceFund.sol/InsuranceFund.json
contracts/out/ChamaVault.sol/ChamaVault.json
contracts/out/ChamaLending.sol/ChamaLending.json
contracts/out/ChamaFactory.sol/ChamaFactory.json
```

Recommended frontend ABI extraction:

```bash
mkdir -p frontend/src/abi
jq '.abi' contracts/out/MembershipRegistry.sol/MembershipRegistry.json > frontend/src/abi/MembershipRegistry.ts
jq '.abi' contracts/out/InsuranceFund.sol/InsuranceFund.json > frontend/src/abi/InsuranceFund.ts
jq '.abi' contracts/out/ChamaVault.sol/ChamaVault.json > frontend/src/abi/ChamaVault.ts
jq '.abi' contracts/out/ChamaLending.sol/ChamaLending.json > frontend/src/abi/ChamaLending.ts
jq '.abi' contracts/out/ChamaFactory.sol/ChamaFactory.json > frontend/src/abi/ChamaFactory.ts
```

For a TypeScript-friendly workflow, configure `@wagmi/cli` to read the Foundry JSON artifacts and generate typed hooks/ABIs. The generated ABI files should be committed only when the contract artifacts are reproducible and the deployment addresses are recorded.

Required ABI operations include:

- MembershipRegistry: `isMember`, `setMember`, `setMembers`.
- InsuranceFund: `usdc`, `vault`, `lendingModule`, `cover` reads/events.
- ChamaVault: `deposit`, `withdraw`, `balanceOf`, `totalAssets`, `totalSupply`, `convertToShares`, `convertToAssets`, `usdc`, `insuranceFund`, `outstandingPrincipal`.
- ChamaLending: `requestLoan`, `approveLoan`, `guarantee`, `activate`, `repay`, `liquidate`, `claimGuaranteeInterest`, `loans`, `guarantees`, `guarantors`, `accruedInterest`, and risk parameter reads.
- ChamaFactory: `createChama`, `chamas`, `nextChamaId`, and `ChamaCreated`.
- USDC: standard ERC-20 `balanceOf`, `allowance`, `approve`, `transfer`, and `decimals`.

## Environment configuration

Create `frontend/.env.local` from `frontend/.env.example`. Contract addresses are deployment-specific and must never be hard-coded in React components.

```env
NEXT_PUBLIC_CHAIN_ID=5042002
NEXT_PUBLIC_RPC_URL=https://rpc.testnet.arc.io
NEXT_PUBLIC_BLOCK_EXPLORER_URL=https://testnet.arcscan.app
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_CHAMA_FACTORY_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_MEMBERSHIP_REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_INSURANCE_FUND_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_CHAMA_VAULT_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_CHAMA_LENDING_ADDRESS=0x0000000000000000000000000000000000000000
```

Use Arc mainnet only after deployment and verification:

```env
NEXT_PUBLIC_CHAIN_ID=5042
NEXT_PUBLIC_RPC_URL=https://rpc.mainnet.arc.io
```

Never place a private key in the Next.js environment. Only public contract addresses and public RPC configuration belong in `NEXT_PUBLIC_*` variables.

## Suggested frontend structure

```text
frontend/
  app/
    page.tsx
    dashboard/page.tsx
    deposit/page.tsx
    withdraw/page.tsx
    loans/page.tsx
    loans/new/page.tsx
    loans/[id]/page.tsx
    guarantees/page.tsx
    claims/page.tsx
    health/page.tsx
    members/page.tsx
    admin/loans/page.tsx
    admin/risk/page.tsx
    settings/page.tsx
  src/
    abi/
    components/
      wallet/
      layout/
      dashboard/
      loans/
      guarantees/
      health/
    config/
      env.ts
      chains.ts
      contracts.ts
    hooks/
      useMemberStatus.ts
      useVaultPosition.ts
      useLoan.ts
      useHealthMetrics.ts
    lib/
      format.ts
      errors.ts
      health.ts
    types/
  public/
  .env.example
```

## Transaction UX requirements

Every write must display:

- Contract action.
- Asset amount.
- Wallet network.
- Required approval transaction, if any.
- Pending wallet signature state.
- Pending chain confirmation state.
- Confirmed transaction hash.
- Revert reason when available.
- Refetched state after confirmation.

Never show a successful deposit, approval, repayment, or loan activation based only on a wallet submission. Mark it successful only after a confirmed receipt and a fresh contract read.

## Indexing

The first version may read individual loan state directly. A production dashboard should add an indexer for:

- `Deposited` and `Withdrawn`.
- `LoanRequested`.
- `LoanApprovalUpdated`.
- `Guaranteed`.
- `LoanActivated`.
- `Repaid`.
- `InterestClaimed`.
- `Liquidated`.
- `ChamaCreated`.
- `MemberStatusChanged`.

The indexer should store event block numbers and transaction hashes. It must not replace direct contract reads for balances or authorization decisions.

## Build sequence

1. Create the Next.js application.
2. Add wallet connection and Arc chain configuration.
3. Add env validation and contract address configuration.
4. Generate ABIs from Foundry artifacts.
5. Build read-only dashboard.
6. Build deposit and withdrawal flows.
7. Build loan request and approval queue.
8. Build multi-guarantor flow.
9. Build activation and repayment flows.
10. Build claims and health screens.
11. Add event indexing.
12. Test against Anvil with the Foundry contracts.
13. Test against Arc testnet.
14. Verify every write with confirmed receipts and refetched state.

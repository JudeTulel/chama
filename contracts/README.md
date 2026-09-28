# Chama USDC Smart Contracts

Single-asset SACCO/chama protocol for Arc using Arc's native USDC ERC-20 interface.

Status: MVP implementation for local development and testnet evaluation. It is not audited and must not be used with production funds.

## Arc network configuration

Arc mainnet:

- Chain ID: `5042`
- RPC: `https://rpc.mainnet.arc.io`
- USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`
- USDC decimals: `6`
- Gas is paid in USDC on Arc.

Arc testnet:

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.io`
- USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`

The protocol uses the ERC-20 USDC interface exclusively for accounting. No WETH wrapper or second asset is used.

## Contracts

For the complete Swagger-style contract interaction reference—including operations, caller permissions, arguments, `cast` examples, events, and lifecycle flows—see [`CONTRACT_API.md`](./CONTRACT_API.md).

### MembershipRegistry.sol

Owner-managed member allowlist. Only approved members can deposit, request loans, or provide guarantees. Replace the owner-controlled membership process with a properly governed/KYC-compatible process before production deployment.

### ChamaVault.sol

The savings pool and ERC-20 share token:

- Accepts USDC deposits.
- Mints `cUSDC` shares.
- Burns shares for USDC withdrawals.
- Calculates share value from pool USDC plus outstanding principal.
- Locks and unlocks shares through the lending module.
- Tracks outstanding loan principal.
- Holds liquid USDC and pays approved loans.

`cUSDC` uses 6 decimals. Share value is calculated as:

`share value = totalAssets / totalSupply`

`totalAssets = liquid USDC in vault + outstanding principal`

### ChamaLending.sol

Loan and guarantee lifecycle:

- Creates fixed-rate USDC loan requests.
- Limits requested principal to the configured share multiplier.
- Accepts guarantor share locks.
- Activates loans after required collateral is locked.
- Accrues simple interest using elapsed time.
- Accepts full repayment.
- Allocates the guarantor share of interest pro rata.
- Sends the configured treasury share to the treasury and the fixed insurance contribution to `InsuranceFund`.
- Unlocks guarantor shares after repayment.
- Allows guarantors to claim earned interest.

- Liquidation, partial repayment, governance timelocks, and production loss coverage are now represented in the MVP, but they remain unaudited and must be tested on testnet before handling real funds.
- `InsuranceFund` receives 1% of every deposit before shares are minted.
- Multiple guarantors can lock shares on the same loan; guarantor interest is allocated pro rata to locked shares.
- On liquidation, the InsuranceFund covers the configured percentage of outstanding principal, then locked shares are burned, then any remaining loss is socialized against outstanding principal.

### InsuranceFund.sol

USDC reserve funded by a fixed 1% fee on every deposit. The lending module can use the reserve to cover the configured portion of an overdue loan. The default coverage setting is 50% of outstanding principal; it can be changed by the lending owner within the 0–100% range.

### ChamaDirectory.sol

Global chama discovery and membership invitations:

- Records every chama created by `ChamaFactory`.
- Stores public chama metadata and contract addresses.
- Stores only invite-code hashes, never raw invite codes.
- Supports expiring invites and maximum-use limits.
- Accepts join requests from wallet addresses.
- Lets the chama owner approve or reject requests.
- On approval, adds the applicant to that chama's `MembershipRegistry`.

Invite links can use this format:

```text
https://app.example.com/join/CHAMA-8F4K-92MX-Q7TP
```

The frontend hashes the code and calls `requestJoin(codeHash)`. Knowing a code does not automatically grant membership; the chama owner must approve the request.

### ChamaFactory.sol

The factory also creates the directory and configures it as the membership manager for the new registry. The directory owner is the factory deployer, while each chama owner controls that chama's invites and join approvals.

### DeployChama.s.sol

Deploys the `ChamaFactory` and creates one chama in the same broadcast using `USDC_ADDRESS`, `TREASURY`, and optional `CHAMA_NAME` (defaults to `Default Chama`). The deployer/caller becomes the owner of the created chama. Names must contain 1–64 UTF-8 bytes. Chama owners can update a name through `ChamaDirectory.setChamaName`.

### Test contracts

`test/MockUSDC.sol` is only for local tests.

`test/ChamaProtocol.t.sol` covers deposit, share issuance, guarantee, loan activation, interest calculation, repayment, and share release.

## Local setup

From this folder:

```bash
forge build
forge test -vv
```

The test suite uses a mock six-decimal USDC token and does not connect to Arc.

## Arc deployment

Use Foundry's environment variables. Store private keys outside the repository.

Bash/Git Bash:

```bash
export DEPLOY_RPC_URL=https://rpc.testnet.arc.io
export PRIVATE_KEY=your_deployer_private_key
forge script script/DeployChama.s.sol:DeployChama \
  --rpc-url "$DEPLOY_RPC_URL" \
  --broadcast \
  --slow
```

Deploy to Arc mainnet only after testnet validation, code review, and audit:

```bash
forge script script/DeployChama.s.sol:DeployChama \
  --rpc-url "$DEPLOY_RPC_URL" \
  --broadcast \
  --slow
```

The script expects the real Arc USDC interface address above. Do not deploy a replacement USDC token on Arc. Deployment and source verification are separate: the Arc Testnet factory and child deployments have successful receipts, but source verification was not confirmed during this deployment.

If you want to retry programmatic verification, Foundry supports Blockscout's v2 API endpoint. This route was not successfully validated for this deployment; the endpoint and key syntax may depend on your Foundry and Blockscout configuration. The `/addresses/<address>/transactions` URL is only a transaction-list endpoint and must not be passed to `--verifier-url`:

```bash
export BLOCKSCOUT_API_KEY=your_blockscout_api_key

forge verify-contract \
  --rpc-url https://rpc.testnet.arc.io \
  --verifier blockscout \
  --verifier-url 'https://api.blockscout.com/v2/api?chain_id=5042002' \
  --etherscan-api-key "$BLOCKSCOUT_API_KEY" \
  0xC5dE0e1630803E3d73d2c89f835f2CC9Db6E94D0 \
  src/ChamaFactory.sol:ChamaFactory
```

The API key must be real; a placeholder, empty variable, or key intended only for ArcScan will produce `Proceed with API key or make a X402 payment to continue`. If your Foundry version supports it, the equivalent explicit verifier-key flag is:

```bash
--verifier-api-key "$BLOCKSCOUT_API_KEY"
```

Use the API key flag supported by your installed `forge verify-contract --help` output. Do not commit the key. An ArcScan browser verification route may also be available, but that route has not been confirmed successful for this deployment:

```text
https://testnet.arcscan.app/address/0xC5dE0e1630803E3d73d2c89f835f2CC9Db6E94D0
```

If the explorer exposes `Contract` → `Verify & Publish`, choose Solidity, and use compiler `0.8.24`, optimizer enabled with 200 runs, and EVM version `cancun`. `ChamaFactory` has no constructor arguments. The Standard JSON files below were generated from the deployment source and settings; successful publication still needs to be confirmed on the explorer.

### Default chama Standard JSON reference files

The following Standard JSON compiler-input files were regenerated from the current committed Solidity sources using Solidity `0.8.24`, optimizer enabled with 200 runs, and EVM version `cancun`. They include transitive imports required by the selected contract. Upload the matching file in ArcScan's Standard JSON verification form and select the listed contract. The addresses below belong to an earlier deployment and must not be used to claim these newer sources match deployed bytecode; verify against contracts redeployed from the current source.

| Contract | Deployed address | Standard JSON file | Contract identifier |
|---|---|---|---|
| ChamaFactory | Prior deployment: `0xC5dE0e1630803E3d73d2c89f835f2CC9Db6E94D0` | `verification/standard-json/ChamaFactory.standard-input.json` | `src/ChamaFactory.sol:ChamaFactory` |
| ChamaDirectory | Prior deployment: `0xba1c6e925096c739303924cc87b705a65dacad59` | `verification/standard-json/ChamaDirectory.standard-input.json` | `src/ChamaDirectory.sol:ChamaDirectory` |
| MembershipRegistry | Prior deployment: `0xeea3897842f62f6cca3264914788b35834be6b29` | `verification/standard-json/MembershipRegistry.standard-input.json` | `src/MembershipRegistry.sol:MembershipRegistry` |
| InsuranceFund | Prior deployment: `0x1bf4ca174204f1ffb4b28bde0d26802fc5ced587` | `verification/standard-json/InsuranceFund.standard-input.json` | `src/InsuranceFund.sol:InsuranceFund` |
| ChamaVault | Prior deployment: `0x540ccf5860a32134278487e3aaba44c4ebdeb8de` | `verification/standard-json/ChamaVault.standard-input.json` | `src/ChamaVault.sol:ChamaVault` |
| ChamaLending | Prior deployment: `0xa11bd4b30af0d1c5390484b3deabc4db7d4c9dfe` | `verification/standard-json/ChamaLending.standard-input.json` | `src/ChamaLending.sol:ChamaLending` |

The files are in `contracts/verification/standard-json/`. They contain source and compiler settings, not private keys. The constructor arguments below describe only the prior deployment; use the arguments from your own deployment when verifying its deployed bytecode:

To regenerate all six files from the `contracts/` directory, I used:

```bash
mkdir -p verification/standard-json
for contract in ChamaFactory ChamaDirectory MembershipRegistry InsuranceFund ChamaVault ChamaLending; do
  ARC_EXPLORER_API_KEY=local-standard-json-generation forge verify-contract \
    --show-standard-json-input \
    --compiler-version 0.8.24 \
    --num-of-optimizations 200 \
    --evm-version cancun \
    0x0000000000000000000000000000000000000001 \
    "src/${contract}.sol:${contract}" \
    > "verification/standard-json/${contract}.standard-input.json"
done
```

This only emits compiler input locally: the placeholder address is not queried or verified, no RPC is used, and the placeholder `ARC_EXPLORER_API_KEY` only satisfies the local Foundry config. Do not use the placeholder address or key for actual verification.

```text
ChamaFactory: none
ChamaDirectory: factory 0xC5dE0e1630803E3d73d2c89f835f2CC9Db6E94D0, owner 0x67352B92EA3a8B38eAF93ca91BD108e7c29B6dd7
MembershipRegistry: owner 0xC5dE0e1630803E3d73d2c89f835f2CC9Db6E94D0
InsuranceFund: USDC 0x3600000000000000000000000000000000000000, owner 0x67352B92EA3a8B38eAF93ca91BD108e7c29B6dd7
ChamaVault: USDC 0x3600000000000000000000000000000000000000, registry 0xeea3897842f62f6cca3264914788b35834be6b29, insurance 0x1bf4ca174204f1ffb4b28bde0d26802fc5ced587, owner 0xC5dE0e1630803E3d73d2c89f835f2CC9Db6E94D0
ChamaLending: vault 0x540ccf5860a32134278487e3aaba44c4ebdeb8de, registry 0xeea3897842f62f6cca3264914788b35834be6b29, treasury 0x67352B92EA3a8B38eAF93ca91BD108e7c29B6dd7, owner 0xC5dE0e1630803E3d73d2c89f835f2CC9Db6E94D0
```

These constructor values match the recorded Arc Testnet deployment receipt. Use the values from your own receipt if your deployment wallet or treasury differs.

If deployment fails with `CreateContractSizeLimit`, update to the current source and rebuild before retrying. The factory deploys several child contracts and must remain below the EVM runtime contract-size limit. The failed transaction does not deploy a usable factory; confirm with:

```bash
cast code 0xFailedFactoryAddress --rpc-url "$DEPLOY_RPC_URL"
```

An output of `0x` means no contract code exists at that address. The verifier API key warning is separate from deployment execution; it affects source verification, not whether the deployment transaction can be mined.

## Post-deployment configuration

1. Set `DEPLOY_RPC_URL` to `https://rpc.testnet.arc.io` or `https://rpc.mainnet.arc.io`.
2. Set `USDC_ADDRESS` to Arc's USDC ERC-20 interface.
3. Set `TREASURY` and `PRIVATE_KEY`.
4. Run the deployment script; the deployer creates and owns the chama.
5. Record the `ChamaCreated` event addresses.
6. Add approved members with `MembershipRegistry.setMember` or `setMembers`.
7. Confirm the vault's USDC address equals Arc's official USDC interface.
8. Set risk parameters through `ChamaLending.setParameters`.
9. Transfer ownership to a multisig before production operation.

Default parameters:

- Maximum loan multiplier: 3x share value.
- Guarantor interest share: 50%.
- Pool share: 38% retained by the vault.
- Treasury share: 3% of every interest payment.
- Interest insurance contribution: 9% of every interest payment, sent to `InsuranceFund`.
- Effective interest split: 50% guarantors, 38% pool, 3% treasury, 9% insurance.
- Deposit insurance contribution: 1% of every deposit.

## Accounting flow

Deposit:

- 1% of every deposit is transferred to `InsuranceFund`; shares are minted against the remaining 99%.
- Depositors therefore pay the insurance contribution at entry rather than receiving shares for the fee amount.

1. A member requests a USDC loan.
2. Other members may lock `cUSDC` shares as guarantees while the request is pending.
3. The chama owner approves or rejects the request with `ChamaLending.approveLoan(id, true|false)`.
4. Other members can continue adding guarantees until activation.
5. The borrower activates the approved loan after sufficient collateral is locked.
6. The vault transfers USDC and increases outstanding principal.

Repayment:

1. Borrower approves USDC to `ChamaLending`.
2. Borrower repays principal plus accrued interest.
3. Principal is removed from outstanding principal.
4. Guarantor interest is recorded pro rata.
5. The 3% treasury fee is sent to the treasury and 9% of interest is sent to `InsuranceFund`.
6. The remaining 38% pool portion stays in the vault, increasing share value.
7. Locked guarantor shares are returned.

## Hypothetical user journey: Alice, Bob, and four guarantors

Assumptions for illustration:

- Alice deposits `1,000 USDC` and receives approximately `990 cUSDC` after the 1% deposit insurance fee.
- For simple arithmetic below, treat Alice's savings/collateral value as `1,000 USDC`.
- Alice borrows `3,000 USDC`, the configured 3x maximum.
- Bob, Carol, Dave, and Eve each guarantee `500 USDC` of cUSDC shares.
- Total guarantor collateral is `2,000 USDC`; Alice's own locked collateral covers the remaining `1,000 USDC`.
- Interest rate is 12% per year and the loan runs for one year, producing `360 USDC` interest.

### Outcome A: Alice repays

Alice pays `3,360 USDC`:

- `3,000 USDC` principal returns to the vault.
- `180 USDC` (50%) is allocated to guarantors.
- `136.80 USDC` (38%) remains in the pool and increases share value.
- `10.80 USDC` (3%) goes to the treasury.
- `32.40 USDC` (9%) goes to the InsuranceFund.

Each guarantor receives `45 USDC` because each supplied 25% of total guarantor collateral. All four guarantors recover their `500 USDC` locked shares and earn a 9% return on the guaranteed amount for this example. Alice recovers her locked shares after repayment.

### Outcome B: Alice defaults

After maturity and the one-day grace period, Alice has not paid. Assume the InsuranceFund contains at least `1,500 USDC` and the configured coverage remains 50%.

The liquidation waterfall is:

1. InsuranceFund pays `1,500 USDC`, covering 50% of the `3,000 USDC` principal.
2. The remaining `1,500 USDC` loss is absorbed by the `1,000 USDC` Alice collateral and `500 USDC` of guarantor collateral.
3. Because four guarantors each supplied `500 USDC`, the guarantor loss is spread evenly: `125 USDC` per guarantor.
4. Bob, Carol, Dave, and Eve each lose 25% of their guaranteed collateral, not the full `500 USDC`.
5. Each guarantor retains economic value of approximately `375 USDC` from the locked collateral. No guarantor interest is paid because Alice did not repay interest.

Without insurance, the `3,000 USDC` exposure would first consume Alice's `1,000 USDC` collateral and then require the guarantors to absorb `2,000 USDC`, or `500 USDC` each. With the 50% insurance coverage, the remaining guarantor loss is reduced to `125 USDC` each in this simplified example. Multiple guarantors diversify the remaining loss; insurance reduces the size of that remaining loss.

The exact on-chain result depends on the InsuranceFund balance, share price, rounding, and the collateral actually locked. This example describes the intended economic behavior, not a guaranteed return or loss cap.

## Solvency health formula

The protocol can assess solvency using total assets, debt stock, insurance, and collateral. To avoid double-counting loans, calculate liquid assets first:

```text
liquidAssets = max(totalAssets - debtStock, 0)
```

Use risk haircuts because collateral may not be fully recoverable:

```text
riskAdjustedRecoveryRatio =
  (
    liquidAssets
    + insuranceBalance
    + 90% * borrowerCollateralValue
    + 75% * guarantorCollateralValue
  ) / debtStock
```

A chama is considered healthy when both conditions hold:

```text
riskAdjustedRecoveryRatio >= 125%
insuranceBalance >= 10% * debtStock
```

Supporting ratios:

```text
insuranceCoverageRatio = insuranceBalance / debtStock
guaranteeCoverageRatio = guarantorCollateralValue / debtStock
debtToAssetsRatio = debtStock / totalAssets
liquidityCoverageRatio = liquidAssets / debtStock
```

Recommended status bands:

- Healthy: risk-adjusted recovery ratio at least 125% and insurance coverage at least 10%.
- Watch: recovery ratio between 100% and 125%, or insurance coverage between 5% and 10%.
- Stressed: recovery ratio between 85% and 100%, or insurance coverage below 5%.
- Critical: recovery ratio below 85%, or total risk-adjusted recovery resources are below the debt stock.

When `debtStock == 0`, debt-based ratios are `N/A`, not infinite. The chama has no lending exposure; it should be reported as `No debt / solvent by construction` while still displaying its liquid assets and insurance balance.

### Zero-debt deposit simulation

Simulation inputs:

- 10 members.
- Each member deposits 100 USDC.
- Total gross deposits: 1,000 USDC.
- Deposit insurance fee: 1%.
- Debt stock: 0 USDC.
- Borrower collateral: 0 USDC.
- Guarantor collateral: 0 USDC.
- Interest: 0 USDC.

Simulation result:

```text
grossDeposits       = 10 * 100       = 1,000 USDC
depositFee          = 1,000 * 1%     =    10 USDC
netVaultAssets      = 1,000 - 10     =   990 USDC
insuranceBalance    = 10 USDC
debtStock           = 0 USDC
liquidAssets        = 990 - 0        =   990 USDC
```

Assessment: `No debt / solvent by construction`. The recovery and insurance ratios are not calculated because their denominator, debt stock, is zero. The vault holds 990 USDC of liquid assets and the InsuranceFund holds 10 USDC. Each member receives shares against 99 USDC of net deposit value, before any interest or loan activity.

## Security and production limitations

This is an unaudited MVP. Before production use, add and test:

- Borrower collateral shares are locked at activation up to the principal amount; guarantor shares cover the remainder.
- Multiple guarantors are supported and earn the guarantor interest allocation pro rata to their locked shares.
- Liquidation begins after maturity plus a one-day grace period. The insurance fund covers the configured percentage (default 50%), locked collateral is burned for the next loss layer, and any remaining shortfall is socialized by reducing vault principal.
- The current implementation still requires security review before production use.
- Timelocked governance and multisig administration.
- Withdrawal controls during liquidity stress.
- Parameter bounds and exposure limits.
- Full invariant, fuzz, and fork tests.
- Static analysis and an independent smart-contract audit.
- Legal, KYC/AML, custody, and cooperative-law review.

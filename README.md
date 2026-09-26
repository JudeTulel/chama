# Chama

Chama is a multi-chama, single-asset cooperative finance application built for Arc using USDC. It combines an on-chain SACCO/chama protocol with a mobile-first Next.js frontend.

The project supports isolated chamas created through a factory. Each chama has its own membership registry, USDC share vault, lending module, and insurance fund. A shared directory provides chama discovery, invite-code links, and join requests.

Status: MVP for local development and Arc testnet evaluation. The contracts are unaudited and must not be used with production funds.

## Repository structure

```text
chama/
├── contracts/             Foundry Solidity project
│   ├── src/               Protocol contracts
│   ├── test/              Solidity tests
│   ├── script/            Deployment scripts
│   └── README.md          Contract documentation
├── frontend/              Next.js mobile-first web application
│   ├── app/               App Router pages
│   ├── components/        Shared UI and wallet components
│   ├── src/abi/           Generated contract ABIs
│   ├── src/config/        Arc and runtime chama discovery configuration
│   └── README.md          Frontend setup notes
├── ARCHITECTURE.md        Protocol architecture and design notes
├── FRONTEND_ARCHITECTURE.md Frontend screen and UX architecture
└── UI-Inspo.png           Mobile UI reference
```

## Core architecture

```text
Next.js frontend
  │
  ├── Dynamic wallet connection
  ├── ChamaDirectory discovery
  ├── Runtime selected-chama configuration
  └── Direct Arc contract reads/writes

ChamaFactory
  ├── creates ChamaDirectory
  └── creates isolated chama deployments

ChamaDirectory
  ├── records chama metadata and contract addresses
  ├── stores invite-code hashes
  ├── accepts join requests
  └── processes owner approvals

Each chama
  ├── MembershipRegistry
  ├── ChamaVault / cUSDC shares
  ├── ChamaLending
  └── InsuranceFund
```

The Factory is shared as a creation mechanism. The Vault and Lending contracts are not shared between chamas: every `createChama` call deploys separate instances with separate addresses and accounting.

## Main protocol features

- Arc-native USDC ERC-20 accounting.
- Six-decimal USDC support.
- ERC-20 `cUSDC` cooperative share token.
- Deposits and withdrawals.
- 1% of every deposit sent to the InsuranceFund.
- Three-times savings-based loan capacity by default.
- Owner loan approval before activation.
- Borrower and guarantor share collateral.
- Multiple guarantors per loan.
- 50% of loan interest allocated to guarantors by default.
- 2% of loan interest sent to the InsuranceFund.
- 10% of loan interest sent to the treasury.
- Remaining pool share retained in the vault.
- Loan repayment and guarantor interest claims.
- Maturity grace period and liquidation flow.
- Insurance-first liquidation waterfall.
- Hashed, expiring, usage-limited chama invite codes.
- Wallet-based join requests with chama-owner approval.
- Chama solvency and risk-health model.

## Arc network

Arc mainnet:

- Chain ID: `5042`
- RPC: `https://rpc.mainnet.arc.io`
- USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`

Arc testnet:

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.io`
- USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`

Arc uses USDC for gas. The contracts use the ERC-20 USDC interface for protocol accounting and do not deploy a replacement USDC token.

## Smart contracts

### ChamaFactory

Deploys and wires a new isolated chama. The caller becomes owner of the created chama contracts. The factory also creates the directory and registers each chama deployment.

### ChamaDirectory

Global discovery and social membership layer. It records chama deployments, stores hashed invitation codes, accepts join requests, and allows each chama owner to approve or reject applicants.

Example invite URL:

```text
https://app.example.com/join/CHAMA-8F4K-92MX-Q7TP
```

The raw code is never stored on-chain. The frontend hashes the code and resolves it through the directory.

### MembershipRegistry

Maintains the member allowlist for a specific chama. Approved members can deposit, request loans, and guarantee loans.

### ChamaVault

The USDC pool and ERC-20 share token:

- Accepts member deposits.
- Sends 1% of deposits to the InsuranceFund.
- Mints `cUSDC` shares against the remaining 99%.
- Tracks liquid USDC and outstanding principal.
- Locks and releases borrower/guarantor shares.
- Disburses approved loans to borrower wallets.

### ChamaLending

Manages the loan lifecycle:

```text
Request
  → owner approval
  → guarantor collateral
  → borrower activation
  → USDC wallet disbursement
  → repayment or liquidation
```

Loan approval is explicit. A borrower cannot activate a request until the chama owner calls `approveLoan(id, true)`.

### InsuranceFund

Receives deposit contributions and 2% of repayment interest. During liquidation, it covers the configured part of outstanding principal before collateral losses and residual socialization are applied.

## Multi-chama joining flow

1. User visits `/onboarding`.
2. Frontend asks whether the user has a chama code.
3. User enters a code or opens `/join/[code]`.
4. Frontend hashes the code and reads the invite from `ChamaDirectory`.
5. The selected chama's own registry, vault, lending, and insurance addresses are loaded at runtime.
6. User connects an EVM wallet through Dynamic.
7. User submits `requestJoin(codeHash)`.
8. Chama owner approves or rejects the request.
9. On approval, the user is added to that chama's `MembershipRegistry`.
10. The user can then deposit, guarantee, or request loans in that selected chama.

Per-chama contract addresses are intentionally not hardcoded in the frontend environment.

## Frontend

The frontend is a Next.js App Router application designed mobile-first from `UI-Inspo.png`.

Current routes:

- `/` and `/onboarding` — chama-code onboarding.
- `/join/[code]` — invite resolution and join request.
- `/deposit` — deposit and insurance overview UI.
- `/loans` — loan eligibility and approval-state UI.
- `/health` — solvency dashboard UI.

The UI uses:

- Next.js.
- TypeScript.
- Manrope typography.
- Green fintech card-based design.
- Lucide icons.
- Dynamic wallet connection.
- Viem public-client reads.
- Generated Foundry ABIs.

Dynamic configuration requires a public environment ID. No private key belongs in the frontend.

## Frontend environment

```bash
cd frontend
cp .env.example .env.local
```

Configure:

```env
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=your_dynamic_environment_id
NEXT_PUBLIC_CHAIN_ID=5042002
NEXT_PUBLIC_RPC_URL=https://rpc.testnet.arc.io
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_CHAMA_FACTORY_ADDRESS=0xFactoryAddress
NEXT_PUBLIC_CHAMA_DIRECTORY_ADDRESS=0xDirectoryAddress
```

Only global addresses belong in this file. Registry, Vault, Lending, and InsuranceFund addresses are discovered from the selected chama record.

Run the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

Build verification:

```bash
npm run build
```

## Smart-contract setup

Prerequisites:

- Foundry.
- Git.
- An Arc testnet wallet funded with USDC for gas and testing.

Run the contract tests:

```bash
cd contracts
forge build
forge test -vv
```

The tests use a local six-decimal mock USDC and do not send transactions to Arc.

## Deployment

Copy the deployment environment template:

```bash
cd contracts
cp .env.example .env
```

Configure:

```env
DEPLOY_RPC_URL=https://rpc.testnet.arc.io
PRIVATE_KEY=your_deployer_private_key
USDC_ADDRESS=0x3600000000000000000000000000000000000000
TREASURY=0xYourTreasuryAddress
```

Never commit `.env` or any private key.

Deploy the factory and an initial chama:

```bash
forge script script/DeployChama.s.sol:DeployChama \
  --rpc-url "$DEPLOY_RPC_URL" \
  --broadcast \
  --slow
```

Record the `ChamaCreated` event and configure the frontend with the deployed Factory and Directory addresses. The event contains the isolated Registry, InsuranceFund, Vault, and Lending addresses for the created chama.

Deploy to Arc mainnet only after testnet validation, independent security review, legal review, and operational controls are complete.

## Accounting model

Deposit:

```text
Gross deposit: 100 USDC
Deposit insurance fee: 1 USDC
Net value used for shares: 99 USDC
```

Interest allocation defaults:

```text
50% → guarantors, pro rata to locked shares
38% → general pool / share value
10% → treasury
 2% → InsuranceFund
```

Solvency health uses:

```text
liquidAssets = max(totalAssets - debtStock, 0)

riskAdjustedRecoveryRatio =
  (liquidAssets
   + insuranceBalance
   + 90% * borrowerCollateralValue
   + 75% * guarantorCollateralValue)
  / debtStock
```

Healthy thresholds:

```text
riskAdjustedRecoveryRatio >= 125%
insuranceBalance >= 10% * debtStock
```

When debt stock is zero, debt-based ratios are reported as `N/A` and the chama is considered solvent by construction.

## Security status and limitations

This repository is an unaudited MVP. Before production use, the protocol requires:

- Independent smart-contract audit.
- Fuzz and invariant testing.
- Formal review of share and liquidation accounting.
- Timelocked governance and multisig ownership.
- Complete partial-repayment handling.
- Production-grade default and liquidation policy.
- Withdrawal controls during liquidity stress.
- Parameter and exposure limits.
- Oracle and collateral valuation review if external assets are added.
- KYC/AML, custody, consumer-protection, cooperative-law, and financial-regulatory review.

The project currently uses owner-controlled membership and risk parameters. Do not use mainnet funds until these controls and legal requirements have been addressed.

## Documentation

- `ARCHITECTURE.md` — original protocol architecture.
- `FRONTEND_ARCHITECTURE.md` — frontend routes, screens, ABI policy, environment model, and UI design.
- `contracts/README.md` — contract functions, accounting, deployment, insurance, liquidation, and simulations.
- `frontend/README.md` — frontend setup and Dynamic wallet notes.

## License

No production license has been selected yet. Review the licensing and regulatory position before public deployment.

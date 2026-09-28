# Chama Protocol Contract API

Swagger-style reference for calling the platform's Solidity contracts. Unlike REST endpoints, contract writes are signed transactions, reads are JSON-RPC `eth_call`s, and successful writes emit events. This guide reflects the current source in `src/` and the Foundry build artifacts; it is not an audit or a promise that every flow is production-safe.

> Status: unaudited MVP for local development and Arc Testnet evaluation. Do not use production funds. The interactions below use Arc Testnet (chain ID `5042002`, RPC `https://rpc.testnet.arc.io`) unless stated otherwise.

## 1. Conventions

- All token amounts are integers in the asset's smallest unit. Arc USDC and cUSDC use 6 decimals: `1 USDC = 1_000_000` units.
- Interest rates, shares, and coverage parameters expressed in basis points use `10_000 = 100%`. Example: `1_000 = 10%` annual rate.
- `Read` means view/pure JSON-RPC call. `Write` means send a transaction and wait for a receipt.
- `Owner` means the contract's OpenZeppelin `Ownable.owner()`, unless an operation has a more specific rule.
- Reverts are transaction failures; event names below are emitted logs, not REST response bodies.
- Obtain deployed addresses from the factory's `ChamaCreated` event or its `chamas(id)` getter. Each chama has its own registry, insurance fund, vault, and lending contract.

## 2. Network and contract map

Arc Testnet:

| Setting | Value |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.io` |
| USDC ERC-20 interface | `0x3600000000000000000000000000000000000000` |
| USDC decimals | `6` |

Contracts and responsibilities:

| Contract | Role |
|---|---|
| `ChamaFactory` | Deploys and wires an isolated chama, owns the global `ChamaDirectory` address, emits child addresses. |
| `ChamaDirectory` | Registers chama metadata, stores hashed invites, accepts join requests, and lets each chama owner approve/reject membership. |
| `MembershipRegistry` | Per-chama member allowlist used by deposit, loan request, guarantee, and other gated functions. |
| `ChamaVault` (`cUSDC`) | Custodies USDC, issues/burns share tokens, tracks principal, locks collateral, and disburses approved loans. |
| `ChamaLending` | Creates/approves loans, accepts share guarantees, activates, repays, allocates interest, and liquidates overdue loans. |
| `InsuranceFund` | Holds USDC contributions and pays a limited reserve amount to lending during liquidation. |

### Default chama reference deployment

The reference addresses and Standard JSON verification files are listed in `README.md` under “Default chama Standard JSON reference files.” Do not assume these addresses apply to another deployment or chain.

## 3. Authentication and transaction setup

There is no user login or API token at the contract layer. The caller is `msg.sender` from the signing wallet. Writes require the relevant token approvals, ownership, membership, or contract-role permission.

Example environment variables for Git Bash:

```bash
export RPC_URL='https://rpc.testnet.arc.io'
export FACTORY='0x...'
export DIRECTORY='0x...'
export REGISTRY='0x...'
export INSURANCE='0x...'
export VAULT='0x...'
export LENDING='0x...'
export USDC='0x3600000000000000000000000000000000000000'
export PRIVATE_KEY='0xYOUR_TEST_WALLET_PRIVATE_KEY'
```

Keep private keys out of source control, docs, browser code, shell history, and chat. For frontend writes, connect a wallet and sign with the user's wallet provider. The `cast send` commands below broadcast real transactions; review chain and addresses before running them.

Foundry ABI artifacts are produced by `forge build` under `out/<Source>.sol/<Contract>.json`. Use those ABI files with ethers/viem, or use Foundry's `cast call` and `cast send` as shown below.

## 4. Operation index

### Factory

| Operation | Type | Caller | Signature |
|---|---|---|---|
| Read chama record | Read | Anyone | `chamas(uint256)` |
| Read directory | Read | Anyone | `directory()` |
| Read next ID | Read | Anyone | `nextChamaId()` |
| Create chama | Write | Anyone | `createChama(address usdc,address treasury,string name)` |

### Directory

| Operation | Type | Caller | Signature |
|---|---|---|---|
| Read chama | Read | Anyone | `chamas(uint256)` |
| Rename chama | Write | Chama owner | `setChamaName(uint256 chamaId,string name)` |
| Read invite | Read | Anyone | `invites(bytes32)` |
| Read join request | Read | Anyone | `joinRequests(uint256,address)` |
| Create invite | Write | Chama owner | `createInvite(uint256 chamaId,bytes32 codeHash,uint256 expiresAt,uint256 maxUses)` |
| Revoke invite | Write | Owning chama's owner | `revokeInvite(bytes32 codeHash)` |
| Request membership | Write | Applicant wallet | `requestJoin(bytes32 codeHash)` |
| Approve/reject join | Write | Chama owner | `approveJoin(uint256 chamaId,address applicant,bool approved)` |
| Open/close chama | Write | Chama owner | `setChamaStatus(uint256 chamaId,bool active,bool acceptingMembers)` |

`setChamaName` accepts a nonempty name up to 64 UTF-8 bytes, updates the chama's directory record, and emits `ChamaNameUpdated`.

### Membership registry

| Operation | Type | Caller | Signature |
|---|---|---|---|
| Check membership | Read | Anyone | `isMember(address)` |
| Read manager / owner | Read | Anyone | `membershipManager()` / `owner()` |
| Set one member status | Write | Registry owner | `setMember(address account,bool active)` |
| Set many members | Write | Registry owner | `setMembers(address[] accounts,bool active)` |
| Approve member | Write | Registry owner or membership manager | `approveMember(address account)` |

### Vault and cUSDC

| Operation | Type | Caller | Signature |
|---|---|---|---|
| Deposit USDC | Write | Approved member | `deposit(uint256 assets)` |
| Withdraw USDC | Write | Approved member | `withdraw(uint256 assets)` |
| Read pool accounting | Read | Anyone | `totalAssets()` / `totalSupply()` / `outstandingPrincipal()` |
| Convert shares/assets | Read | Anyone | `convertToShares(uint256 assets)` / `convertToAssets(uint256 shares)` |
| Read cUSDC balance | Read | Anyone | `balanceOf(address)` |
| Read token info | Read | Anyone | `name()` / `symbol()` / `decimals()` |
| Read pause state | Read | Anyone | `paused()` |
| Pause/unpause | Write | Vault owner | `pause()` / `unpause()` |
| Read wired contracts | Read | Anyone | `usdc()` / `registry()` / `insuranceFund()` / `lendingModule()` |

`cUSDC` is an ERC-20 share token. The inherited ERC-20 `transfer`, `transferFrom`, and `approve` operations are also available. Direct share transfers do not perform a membership check. The lending module's internal collateral operations are separately permissioned.

### Lending

| Operation | Type | Caller | Signature |
|---|---|---|---|
| Request loan | Write | Member borrower | `requestLoan(uint256 amount,uint256 rateBps,uint256 maturity)` |
| Approve/reject loan | Write | Lending owner | `approveLoan(uint256 id,bool approved)` |
| Lock guarantee shares | Write | Member guarantor (not borrower) | `guarantee(uint256 id,uint256 shares)` |
| Activate loan | Write | Borrower, after approval | `activate(uint256 id)` |
| Repay | Write | Borrower | `repay(uint256 id,uint256 amount)` |
| Liquidate overdue loan | Write | Anyone after maturity + grace period | `liquidate(uint256 id)` |
| Claim guarantor interest | Write | Guarantor with accrued claim | `claimGuaranteeInterest(uint256 id)` |
| Read loan / guarantor | Read | Anyone | `loans(uint256)` / `guarantees(uint256,address)` / `guarantors(uint256,uint256)` |
| Read accrued interest | Read | Anyone | `accruedInterest(uint256)` |
| Read parameters | Read | Anyone | `maxLoanMultiplierBps()` / `guarantorShareBps()` / `poolShareBps()` / `insuranceShareBps()` / `insuranceCoverageBps()` / `treasury()` |
| Update interest split/multiplier | Write | Lending owner | `setParameters(uint256 multiplierBps,uint256 guarantorBps,uint256 poolBps,uint256 insuranceBps)` |
| Update reserve coverage | Write | Lending owner | `setInsuranceCoverage(uint256 coverageBps)` |
| Read pause state | Read | Anyone | `paused()` |

Although `ChamaLending` inherits OpenZeppelin `Pausable` and gates request/guarantee/activate/repay operations with `whenNotPaused`, the current contract ABI exposes no `pause()` or `unpause()` function. It therefore cannot currently be paused through its public contract interface.

### Insurance fund

| Operation | Type | Caller | Signature |
|---|---|---|---|
| Read balances/wiring | Read | Anyone | `usdc()` / `vault()` / `lendingModule()`; USDC balance via `USDC.balanceOf(INSURANCE)` |
| Set vault | Write | Insurance owner, once only | `setVault(address vault)` |
| Set lending module | Write | Insurance owner | `setLendingModule(address module)` |

`recordDepositFee` is callable only by the vault and only emits a record event; the vault transfers USDC to the fund separately. `cover` is callable only by the lending module. Users cannot directly withdraw from the fund.

## 5.1 Restricted wiring, module, and ownership operations

These ABI functions are public at the EVM level but are not general user operations. Calling them from an unauthorized wallet reverts.

| Contract | Function | Authorized caller | Purpose |
|---|---|---|---|
| Factory | Constructor | Deployment transaction | Deploys the global directory and sets its address immutably. |
| Directory | `registerChama(address,address,address,address,address,address,string,string)` | Factory only | Registers a factory-created chama. |
| Registry | `setMembershipManager(address)` | Registry owner | Sets the directory/manager address. |
| Registry | `approveMember(address)` | Registry owner or configured membership manager | Adds one member. |
| InsuranceFund | `setVault(address)` | Insurance owner; one-time | Wires the vault. |
| InsuranceFund | `setLendingModule(address)` | Insurance owner | Wires lending authority. |
| InsuranceFund | `recordDepositFee(uint256)` | Vault only | Emits the deposit contribution event; does not transfer tokens. |
| InsuranceFund | `cover(uint256,address,uint256)` | Lending module only | Transfers up to the requested reserve amount to the recipient. |
| Vault | `setLendingModule(address)` | Vault owner | Wires lending authority. |
| Vault | `lockShares(address,uint256)`, `unlockShares(address,uint256)`, `burnLockedShares(uint256)` | Lending module only | Manages collateral custody/burning. |
| Vault | `disburseLoan(address,uint256)`, `transferUSDC(address,uint256)` | Lending module only | Moves vault USDC for protocol actions. |
| Vault | `increasePrincipal(uint256)`, `decreasePrincipal(uint256)` | Lending module only | Updates outstanding principal. |
| Lending | `setParameters(uint256,uint256,uint256,uint256)`, `setInsuranceCoverage(uint256)` | Lending owner | Changes multiplier, fee split, and reserve coverage settings. |
| Ownable contracts | `transferOwnership(address)`, `renounceOwnership()` | Current owner | Transfers or permanently relinquishes administration; renunciation is irreversible. |

The factory automatically performs the child wiring during `createChama`, then transfers ownership of `MembershipRegistry`, `InsuranceFund`, `ChamaVault`, and `ChamaLending` to the chama creator. The global directory owner is the factory deployer. Verify actual ownership on-chain before administrative calls.

## 5. Chama creation and discovery

### `ChamaFactory.createChama`

```text
createChama(address usdc, address treasury, string name)
```

- Caller: any wallet; the caller becomes owner of the created registry, insurance fund, vault, and lending contract.
- `usdc`: ERC-20 asset address; must be nonzero.
- `treasury`: recipient of the treasury interest allocation; must be nonzero.
- `name`: required chama name, from 1 to 64 UTF-8 bytes.
- Returns the chama ID. Read child addresses from `chamas(id)` and the directory entry.
- The receipt emits `ChamaCreated(id, owner, registry, insuranceFund, vault, lending)`.
- The directory is created once in the factory constructor and is available via `directory()`.
- The directory records the supplied name and an empty metadata URI.

Example:

```bash
cast send "$FACTORY" 'createChama(address,address,string)' "$USDC" '0xTREASURY' 'Nairobi Women Savers' \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

Capture the transaction receipt and `ChamaCreated` log to discover the addresses. Do not mistake the factory address for any child contract.

### `ChamaDirectory.createInvite`

```text
createInvite(uint256 chamaId, bytes32 codeHash, uint256 expiresAt, uint256 maxUses)
```

- Caller: owner of the chama identified by `chamaId`.
- `codeHash`: nonzero hash of a high-entropy invite code. The contract stores only this hash.
- `expiresAt`: Unix timestamp; `0` means no expiry.
- `maxUses`: positive maximum number of join requests; use count increments when requests are submitted, not when they are approved.
- Emits `InviteCreated(codeHash, chamaId, expiresAt, maxUses)`.

Generate a hash off-chain. The exact encoding must match the encoding used by the client; this example hashes the UTF-8 bytes of a string:

```bash
cast keccak 'NAIROBI-7K4Q2M-USE-A-LONG-RANDOM-CODE'
```

```bash
cast send "$DIRECTORY" 'createInvite(uint256,bytes32,uint256,uint256)' \
  0 '0xCODE_HASH' 0 10 --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

Never use the short example invite as a real bearer credential. Do not publish raw invite codes on-chain.

### Request and approve membership

Applicant requests membership using the hash (no raw code is sent in the transaction):

```bash
cast send "$DIRECTORY" 'requestJoin(bytes32)' '0xCODE_HASH' \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

The chama owner reviews and approves or rejects:

```bash
cast send "$DIRECTORY" 'approveJoin(uint256,address,bool)' 0 '0xAPPLICANT' true \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

Approval causes the directory to call `MembershipRegistry.approveMember`. A request by itself is not membership. Invite uses are consumed at request time, even if the owner later rejects the request. A processed request can be submitted again while the invite remains usable.

## 6. Membership administration

- The chama owner is the owner of the registry after factory creation.
- The directory is configured as `membershipManager`; owner approval via the directory can add members.
- `setMember(account, false)` revokes a member.
- `setMembers(accounts, active)` applies the same status to every array entry; avoid very large arrays because every entry costs gas.
- `approveMember(account)` can add but not revoke a member; only owner or configured manager can call it.

```bash
cast call "$REGISTRY" 'isMember(address)(bool)' '0xWALLET' --rpc-url "$RPC_URL"
cast send "$REGISTRY" 'setMember(address,bool)' '0xWALLET' true \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

## 7. Savings and cUSDC

### Deposit

```text
deposit(uint256 assets) returns (uint256 shares)
```

Requirements: caller is a member, vault is not paused, amount is nonzero, and caller approved the vault to spend USDC.

The vault deducts a 1% deposit contribution to InsuranceFund; shares are computed for the remaining 99%. For a first deposit, shares equal net assets in 6-decimal units. Later deposits use `assets * totalSupply / totalAssets` conversion and integer rounding.

```bash
cast send "$USDC" 'approve(address,uint256)' "$VAULT" 100000000 \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
cast send "$VAULT" 'deposit(uint256)' 100000000 \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

The example deposits 100 USDC (not 100 USDC units).

### Withdraw

```text
withdraw(uint256 assets) returns (uint256 shares)
```

Requirements: caller is a member, vault is not paused, amount is nonzero, liquid USDC in the vault is sufficient, and caller owns enough cUSDC. Withdrawals pay liquid assets only; outstanding principal is included in `totalAssets` but is not immediately withdrawable cash. The vault burns the calculated shares then transfers USDC.

```bash
cast send "$VAULT" 'withdraw(uint256)' 10000000 \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

### Read pool value

```bash
cast call "$VAULT" 'totalAssets()(uint256)' --rpc-url "$RPC_URL"
cast call "$VAULT" 'totalSupply()(uint256)' --rpc-url "$RPC_URL"
cast call "$VAULT" 'convertToAssets(uint256)(uint256)' 1000000 --rpc-url "$RPC_URL"
cast call "$VAULT" 'balanceOf(address)(uint256)' '0xWALLET' --rpc-url "$RPC_URL"
```

Current implementation defines `totalAssets = USDC balance held by vault + outstandingPrincipal`. The vault's reserve contribution is held at the separate InsuranceFund and does not count as vault assets.

## 8. Loan lifecycle

State enum values in ABI order:

| Numeric value | Status |
|---:|---|
| 0 | `Pending` |
| 1 | `Active` |
| 2 | `Repaid` |
| 3 | `Defaulted` |
| 4 | `Liquidated` |

The current source writes `Pending`, `Active`, `Repaid`, and `Liquidated`; it does not assign `Defaulted` in the documented flow.

### A. Request

```text
requestLoan(uint256 amount,uint256 rateBps,uint256 maturity) returns (uint256 id)
```

Caller must be an approved member and lending must not be paused. Amount must be positive, maturity must be in the future, and rate must not exceed 5,000 BPS (50%). The request checks amount against the configured multiplier of the caller's current cUSDC value. It emits `LoanRequested(id, borrower, amount)` and starts unapproved.

```bash
cast send "$LENDING" 'requestLoan(uint256,uint256,uint256)' \
  50000000 1000 1790000000 --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

Use a future Unix timestamp for maturity. This example is illustrative; confirm the current timestamp and intended term before broadcasting.

### B. Owner approval

```text
approveLoan(uint256 id,bool approved)
```

Only the lending owner may approve/reject an existing pending loan. Approval emits `LoanApprovalUpdated`. Rejection is represented by leaving `approved=false`; the contract does not add a separate rejected status.

### C. Guarantees

```text
guarantee(uint256 id,uint256 shares)
```

Caller must be a member, not the borrower, the loan must be pending, and shares must be positive. A maximum of 32 distinct guarantors is enforced per loan. The shares move to the lending module's custody through the vault and are recorded in `guarantees(id, guarantor)`.

```bash
cast send "$LENDING" 'guarantee(uint256,uint256)' 0 25000000 \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

### D. Activate

```text
activate(uint256 id)
```

Only the approved borrower may activate. It changes the loan to active, adds principal to vault accounting, locks borrower shares if any, and asks the vault to transfer the principal to the borrower. The vault must have enough liquid USDC.

**Important implementation caveat:** the current activation check adds raw guarantor share units and borrower cUSDC balance, then compares that sum with the USDC principal. It does not convert these share amounts to assets for the check. Although both token types use 6 decimals, their exchange values can diverge. Review this accounting before relying on collateral coverage.

### E. Repay

```text
repay(uint256 id,uint256 amount)
```

Only the active loan's borrower may repay. The borrower must approve `ChamaLending` to spend USDC. `amount` must be at least outstanding principal plus accrued simple interest; partial repayment is not supported. Interest accrues from request creation to the earlier of current time or maturity, at `rateBps` per year.

```bash
cast send "$USDC" 'approve(address,uint256)' "$LENDING" 60000000 \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
cast send "$LENDING" 'repay(uint256,uint256)' 0 60000000 \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

Do not copy the example amount without reading `loans(id)` and `accruedInterest(id)`. If an amount greater than the exact owed amount is accepted, the excess is transferred to the vault and is not separately refunded by this function.

On repayment, the contract marks the loan repaid, reduces principal, records the guarantor claim share pro rata to locked shares, sends treasury/insurance allocations, and unlocks guarantor and borrower collateral. It emits `Repaid(id, principal, interest)`.

Current interest split:

| Destination | Share of interest |
|---|---:|
| Guarantor claims | 50% |
| Vault pool | 38% |
| Treasury | 3% |
| Insurance fund | 9% |

The `setParameters` arguments are `(multiplierBps, guarantorBps, poolBps, insuranceBps)`. In current code `insuranceBps` represents the 3% treasury portion despite its name; the extra fixed `INTEREST_INSURANCE_BPS()` is 9% to the fund. The setter requires `guarantor + pool + parameter + fixed insurance = 10_000`.

A guarantor claims recorded interest using:

```bash
cast send "$LENDING" 'claimGuaranteeInterest(uint256)' 0 \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

A successful repayment unlocks guarantee shares; it does not automatically transfer the guarantor's interest claim.

### F. Liquidate

```text
liquidate(uint256 id)
```

Callable by anyone only when the loan remains active and `block.timestamp` is later than maturity plus the 1-day grace period. The lending contract asks InsuranceFund to pay up to `insuranceCoverageBps` of outstanding principal, capped by reserve balance. It then burns locked shares and reduces accounting for collateral value and remaining loss; emits `Liquidated(id, insuredAmount, collateralLoss)`.

`setInsuranceCoverage` can set 0–10,000 BPS. The default is 5,000 BPS (50%). This is a target share of principal, not a guarantee that the fund holds enough money. Liquidation math, share conversion, and loss socialization require security/accounting review before production use.

## 9. Read/query reference

Common Foundry reads:

```bash
# Contract wiring
cast call "$VAULT" 'usdc()(address)' --rpc-url "$RPC_URL"
cast call "$VAULT" 'registry()(address)' --rpc-url "$RPC_URL"
cast call "$VAULT" 'insuranceFund()(address)' --rpc-url "$RPC_URL"
cast call "$VAULT" 'lendingModule()(address)' --rpc-url "$RPC_URL"

# Loan record (decode tuple according to ABI / `loans` struct)
cast call "$LENDING" 'loans(uint256)' 0 --rpc-url "$RPC_URL"
cast call "$LENDING" 'accruedInterest(uint256)(uint256)' 0 --rpc-url "$RPC_URL"
cast call "$LENDING" 'guarantees(uint256,address)' 0 '0xGUARANTOR' --rpc-url "$RPC_URL"

# Membership / directory records
cast call "$REGISTRY" 'isMember(address)(bool)' '0xWALLET' --rpc-url "$RPC_URL"
cast call "$DIRECTORY" 'chamas(uint256)' 0 --rpc-url "$RPC_URL"
cast call "$DIRECTORY" 'joinRequests(uint256,address)' 0 '0xAPPLICANT' --rpc-url "$RPC_URL"
```

Use each contract's ABI to decode tuples and enum values. Struct getter outputs omit dynamic arrays; enumerate guarantors using `guarantors(loanId,index)` until the index reaches the event/known list length maintained by the client.

## 10. Events for indexers and transaction UIs

| Contract | Event | Meaning |
|---|---|---|
| Factory | `ChamaCreated(id, owner, registry, insuranceFund, vault, lending)` | New chama and child addresses. |
| Directory | `ChamaRegistered(chamaId, owner, registry, name)` | Chama directory entry created. |
| Directory | `InviteCreated(codeHash, chamaId, expiresAt, maxUses)` / `InviteRevoked(codeHash)` | Invite lifecycle. |
| Directory | `JoinRequested(chamaId, applicant, codeHash)` / `JoinProcessed(chamaId, applicant, approved)` | Membership request and decision. |
| Directory | `ChamaStatusUpdated(chamaId, active, acceptingMembers)` | Discovery/join status changed. |
| Registry | `MemberStatusChanged(account, active)` | Membership status changed. |
| Vault | `Deposited(member, assets, shares)` / `Withdrawn(member, assets, shares)` | User savings transactions. |
| Vault | `PrincipalUpdated(outstandingPrincipal)` | Loan principal accounting changed. |
| Lending | `LoanRequested(id, borrower, amount)` / `LoanApprovalUpdated(id, approved)` | Loan request and owner decision. |
| Lending | `Guaranteed(id, guarantor, shares)` / `LoanActivated(id)` | Collateral committed and loan funded. |
| Lending | `Repaid(id, principal, interest)` / `InterestClaimed(id, guarantor, amount)` | Repayment and claim activity. |
| Lending | `Liquidated(id, insuredAmount, collateralLoss)` | Liquidation accounting. |
| Insurance | `DepositFeeReceived(from, amount)` / `DefaultCovered(loanId, amount)` | Reserve funding notice and payout. |

For robust indexing, also subscribe to ERC-20 `Transfer` events from USDC and cUSDC, `Approval` for cUSDC, and OpenZeppelin `OwnershipTransferred`, `Paused`, and `Unpaused` events. Wait for the configured confirmation depth before treating a transaction as final.

## 11. Revert/validation checklist

A write can revert when the caller is not a member/owner/manager, a contract is paused, a loan is in the wrong status, the amount is zero/insufficient, token allowance or balance is insufficient, an invite is invalid/expired/used up, a loan lacks approval, the vault lacks liquid assets, or the operation violates configured limits. Solidity custom errors and revert strings are visible in the transaction trace; simulate with `cast call` where possible before sending.

Always check:

1. Wallet is on the expected chain ID `5042002`.
2. Target address matches this chama and has deployed bytecode.
3. Caller has the required member/owner role.
4. Token amounts use six-decimal base units.
5. ERC-20 approval targets the correct spender (`VAULT` for deposit; `LENDING` for repayment).
6. Loan is approved and collateral has been recorded before activation.
7. `amount` covers exact owed principal plus interest on repayment.
8. Receipt status is successful and expected events are present.

## 12. Security and scope notes

- This guide describes the present implementation, not a security endorsement. The contracts are explicitly unaudited MVP code.
- The lending contract uses loops over guarantors during repayment; it limits distinct guarantors to 32, but assess gas and arithmetic behavior independently.
- The vault pause blocks vault deposit/withdraw, but does not itself disable every ERC-20 share-token operation. Review the actual gated functions rather than treating pause as a global protocol freeze.
- Current source has accounting-sensitive behavior called out above, including activation's raw-share collateral comparison and the interest parameter's misleading variable name.
- Administrative ownership is initially held by the chama creator for child contracts. Transfer ownership to a reviewed multisig before any production deployment.
- Invite codes are bearer secrets. Store hashes on-chain, generate high-entropy codes, limit uses, expire/revoke when appropriate, and avoid putting personal data in metadata or events.
- Contract addresses, network parameters, and ABIs must be selected for the active chain and deployment, not copied from the reference deployment blindly.

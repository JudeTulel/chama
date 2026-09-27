# Chama mobile-first frontend

Next.js App Router frontend scaffold based on `FRONTEND_ARCHITECTURE.md` and `UI-Inspo.png`.

## Run

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

- `/onboarding` asks whether the user has a chama code.
- `/join/[code]` resolves the invite through the deployed `ChamaDirectory`, stores the selected chama, and submits a join request through the connected Dynamic wallet.
- `/deposit` reads the connected account's USDC balance, registry membership, vault shares/value/assets/liquidity, and insurance balance; an approved member can submit the on-chain USDC approval and vault deposit. The selected deployment is checked against the live directory immediately before a deposit.
- The no-invite default is chama ID 0 from the deployed directory; invite-selected child addresses are read from the on-chain directory. Default child addresses in `.env.example` are for reference only.
- `/loans` and `/health` are explicitly informational; loan lifecycle actions and aggregate health metrics are not wired yet. Do not treat these pages as live functionality.

## Dynamic wallet connection

Set `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` in `.env.local` from the Dynamic dashboard. The app uses Dynamic's React SDK with `EthereumWalletConnectors` for Arc's EVM network and `DynamicWidget` for the mobile-friendly connect/auth UI. The current provider uses `connect-only`; change this only if wallet ownership signatures are required for the product flow.

Enable Arc Testnet (chain ID `5042002`) as an EVM network in the Dynamic dashboard and configure its RPC there or through the app environment. Set `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` in `.env.local`; wallet actions stay disabled until this is configured. Do not put a Dynamic secret or private key in the frontend.


Foundry ABIs are generated into `src/abi/`. The factory and directory default to the deployed Arc Testnet addresses; RPC, USDC and default deployment addresses can be overridden using the `NEXT_PUBLIC_*` variables in `.env.example`. Invite lookups discover child contract addresses at runtime.

Deposits require Dynamic setup, an Arc Testnet wallet, USDC, and approved chama membership. The wallet transaction path has not been exercised with a signed transaction in this development session. Loans and health are not implemented; other contract actions remain available through `contracts/CONTRACT_API.md`, not the UI.

Do not commit `.env.local` or private keys.

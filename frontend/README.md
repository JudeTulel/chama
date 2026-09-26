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
- `/join/[code]` resolves the invite through `ChamaDirectory`, displays the selected chama, and submits the join request through the connected Dynamic wallet.
- Individual registry, insurance, vault, and lending addresses are discovered at runtime from the selected chama record; they are not stored in environment variables.

## Dynamic wallet connection

Set `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` in `.env.local` from the Dynamic dashboard. The app uses Dynamic's React SDK with `EthereumWalletConnectors` for Arc's EVM network and `DynamicWidget` for the mobile-friendly connect/auth UI. The current provider uses `connect-only`; change this only if wallet ownership signatures are required for the product flow.

Enable Arc mainnet/testnet as an EVM network in the Dynamic dashboard and configure its RPC there or through the app environment. Do not put a Dynamic secret or private key in the frontend.


Foundry ABIs are generated into `src/abi/`. Contract addresses and Arc RPC settings are loaded from `.env.local`; copy the deployed addresses from the `ChamaCreated` event into the `NEXT_PUBLIC_*` variables.

The current pages are presentation scaffolding. The contract reader in `src/config/readers.ts` is the first direct Arc read path. Write flows will use wagmi wallet hooks after deployment addresses are configured.

Do not commit `.env.local` or private keys.

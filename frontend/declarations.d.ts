// type resolutions for modules that ship no .d.ts (pre-existing gaps)

// viem ships its own .d.ts (_types/index.d.ts); no override needed.

// lucide-react ships no types; treat module as any (named imports are `any`)
declare module 'lucide-react' {
  const icons: Record<string, any>;
  export default icons;
  export const __esModule: boolean;
  export const Activity: any;
  export const ArrowDownLeft: any;
  export const ArrowDownToLine: any;
  export const ArrowLeft: any;
  export const ArrowRight: any;
  export const ArrowRightLeft: any;
  export const ArrowUpRight: any;
  export const Bell: any;
  export const Check: any;
  export const CheckCircle2: any;
  export const CircleAlert: any;
  export const CircleHelp: any;
  export const Clock3: any;
  export const Coins: any;
  export const Copy: any;
  export const ExternalLink: any;
  export const Eye: any;
  export const Hash: any;
  export const Home: any;
  export const KeyRound: any;
  export const Landmark: any;
  export const Link2: any;
  export const LoaderCircle: any;
  export const Mail: any;
  export const MessageCircle: any;
  export const Pencil: any;
  export const PiggyBank: any;
  export const RefreshCw: any;
  export const Settings2: any;
  export const ShieldCheck: any;
  export const Sparkles: any;
  export const UserRound: any;
  export const Users: any;
  export const Wallet: any;
  export const WalletCards: any;
  export const X: any;
}
declare module 'next/link';
declare module 'next/image-types/global';

// @dynamic-labs / wallet-connector modules ship no types
declare module '@dynamic-labs/ethereum';
declare module '@dynamic-labs/ethereum/react';
declare module '@dynamic-labs/ethereum/viem';
declare module '@dynamic-labs/ethereum/connectors';
declare module '@dynamic-labs/wallet-connector-core';
declare module '@dynamic-labs/wallet-connector-web3modal';
declare module '@dynamic-labs/wallet-connector-lean';
declare module '@dynamic-labs/wallet-connector-injected';
declare module '@dynamic-labs/wallet-connector-argent';
declare module '@dynamic-labs/wallet-connector-zeal';
declare module '@dynamic-labs/wallet-connector-ledger';
declare module '@dynamic-labs/wallet-connector-trezor';
declare module '@dynamic-labs/wallet-connector-keystone';
declare module '@dynamic-labs/wallet-connector-torus';
declare module '@dynamic-labs/wallet-connector-rainbow';
declare module '@dynamic-labs/wallet-connector-math';
declare module '@dynamic-labs/wallet-connector-coinbase';
declare module '@dynamic-labs/wallet-connector-liquid';
declare module '@dynamic-labs/wallet-connector-xdefi';
declare module '@dynamic-labs/wallet-connector-coin98';
declare module '@dynamic-labs/wallet-connector-immortal';
declare module '@dynamic-labs/wallet-connector-keepkey';
declare module '@dynamic-labs/store';
declare module '@dynamic-labs/waas';
declare module '@dynamic-labs/sdk-react-core' {
  export type Wallet = unknown;
}

// @dynamic-labs-sdk/client (the JS SDK, ships CJS/ESM, no .d.ts)
declare module '@dynamic-labs-sdk/client' {
  export function getSwapQuote(params: any, client?: any): Promise<any>;
  export function executeSwapTransaction(params: any, client?: any): Promise<{ transactionHash: string }>;
  export function getSwapStatus(params: any, client?: any): Promise<any>;
}

// viem, next, react-dom, and @dynamic-labs ship their own type
// augmentations of the browser Window. The Dynamic/MetaMask ethereum
// provider however is only a runtime global, so we add the missing shape.
declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] | unknown }): Promise<string>;
    };
  }
}

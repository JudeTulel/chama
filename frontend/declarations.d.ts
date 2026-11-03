// type resolutions for modules that ship no .d.ts (pre-existing gaps)

// viem ships CJS main -> type resolution
declare module 'viem' {
  interface Address {}
  interface Hex {}
  function formatUnits(v: bigint, decimals?: number): string;
  function parseUnits(s: string, decimals?: number): bigint;
  function createPublicClient(options: any): any;
  function http(url: string, opts?: any): any;
  function getAddress(a: string): Address;
  const erc20Abi: unknown[];
}

// lucide-react ships no types; treat as any
declare module 'lucide-react';
declare module 'next/link';

// @dynamic-labs modules ship no types
declare module '@dynamic-labs/ethereum';
declare module '@dynamic-labs/sdk-react-core';
declare module '@dynamic-labs/sdk-api-core';
declare module '@dynamic-labs/waas';
declare module '@dynamic-labs/waas-evm';
declare module '@dynamic-labs/store';

// @dynamic-labs-sdk/client (the JS SDK, ships CJS/ESM, no .d.ts)
declare module '@dynamic-labs-sdk/client' {
  export function getSwapQuote(params: any, client?: any): Promise<any>;
  export function executeSwapTransaction(params: any, client?: any): Promise<{ transactionHash: string }>;
  export function getSwapStatus(params: any, client?: any): Promise<any>;
}

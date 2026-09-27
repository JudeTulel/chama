'use client';

import { DynamicContextProvider, DynamicWidget } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { addresses, arc } from '../src/config/contracts';

const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || '';
const arcWalletNetwork = {
  name: arc.name,
  shortName: 'ARC',
  chain: 'EVM',
  chainId: arc.id,
  networkId: arc.id,
  isTestnet: true,
  iconUrls: [],
  rpcUrls: [arc.rpcUrls.default.http[0]],
  blockExplorerUrls: [],
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
};

export function DynamicProvider({ children }: { children: React.ReactNode }) {
  if (!environmentId) {
    return <>{children}</>;
  }
  return <DynamicContextProvider settings={{ environmentId, walletConnectors: [EthereumWalletConnectors], initialAuthenticationMode: 'connect-only', mobileExperience: 'redirect', overrides: { evmNetworks: [arcWalletNetwork] } }}>{children}</DynamicContextProvider>;
}

export function WalletButton() {
  if (!environmentId) return <button className="wallet-button" disabled>Set Dynamic environment</button>;
  return <DynamicWidget />;
}

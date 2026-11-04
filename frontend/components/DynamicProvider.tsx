'use client';

import { DynamicContextProvider, DynamicWidget } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { addresses, arc } from '../src/config/contracts';

const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || '';
// SDK hooks require an initialized store even before Dynamic is configured.
// Wallet controls remain disabled until a real environment ID is set.
const providerEnvironmentId = environmentId || '00000000-0000-0000-0000-000000000000';
const arcWalletNetwork = {
  name: arc.name,
  shortName: 'ARC',
  chain: 'EVM',
  chainId: arc.id,
  networkId: arc.id,
  isTestnet: arc.id !== 5042,
  iconUrls: [],
  rpcUrls: [arc.rpcUrls.default.http[0]],
  blockExplorerUrls: arc.id === 5042 ? ['https://explorer.arc.io'] : [],
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
};

export function DynamicProvider({ children }: { children: React.ReactNode }) {
  return <DynamicContextProvider settings={{ environmentId: providerEnvironmentId, walletConnectors: [EthereumWalletConnectors], initialAuthenticationMode: 'connect-only', mobileExperience: 'redirect', overrides: { evmNetworks: [arcWalletNetwork] } }}>{children}</DynamicContextProvider>;
}

export function WalletButton() {
  if (!environmentId) return <button className="wallet-button" disabled>Set Dynamic environment</button>;
  return <DynamicWidget />;
}

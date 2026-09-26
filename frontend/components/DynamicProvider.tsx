'use client';

import { DynamicContextProvider, DynamicWidget } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || '';

export function DynamicProvider({ children }: { children: React.ReactNode }) {
  if (!environmentId) {
    return <>{children}</>;
  }
  return <DynamicContextProvider settings={{ environmentId, walletConnectors: [EthereumWalletConnectors], initialAuthenticationMode: 'connect-only', mobileExperience: 'redirect' }}>{children}</DynamicContextProvider>;
}

export function WalletButton() {
  if (!environmentId) return <button className="wallet-button" disabled>Set Dynamic environment</button>;
  return <DynamicWidget />;
}

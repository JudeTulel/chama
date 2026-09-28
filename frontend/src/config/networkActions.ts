export interface SwitchableWallet {
  getNetwork(): Promise<number | string | undefined>;
  switchNetwork(chainId: number | string): Promise<void>;
}

export async function ensureWalletNetwork(wallet: SwitchableWallet, chainId: number) {
  const currentChainId = await wallet.getNetwork();
  if (Number(currentChainId) === chainId) return;

  await wallet.switchNetwork(chainId);
  const switchedChainId = await wallet.getNetwork();
  if (Number(switchedChainId) !== chainId) {
    throw new Error(`Wallet did not switch to chain ${chainId}. Approve the network change and try again.`);
  }
}

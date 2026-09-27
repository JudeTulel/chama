import { erc20Abi } from 'viem';
import { publicClient, type ChamaDeployment } from './contracts';
import { chamaVaultAbi } from '../abi/ChamaVault';

export async function readMemberPosition(account: `0x${string}`, chama: ChamaDeployment) {
  const [walletBalance, shares, totalAssets, liquidAssets] = await Promise.all([
    publicClient.readContract({ address: chama.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
    publicClient.readContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'balanceOf', args: [account] }),
    publicClient.readContract({ address: chama.vault, abi: chamaVaultAbi, functionName: 'totalAssets' }),
    publicClient.readContract({ address: chama.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [chama.vault] }),
  ]);
  return { walletBalance, shares, totalAssets, liquidAssets };
}

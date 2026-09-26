import { createPublicClient, http, defineChain, getAddress, type Address } from 'viem';

const zero = '0x0000000000000000000000000000000000000000' as Address;
const env = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 5042002),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.testnet.arc.io',
  usdc: process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000',
  factory: process.env.NEXT_PUBLIC_CHAMA_FACTORY_ADDRESS || zero,
  directory: process.env.NEXT_PUBLIC_CHAMA_DIRECTORY_ADDRESS || zero,
};
export const arc = defineChain({ id: env.chainId, name: env.chainId === 5042 ? 'Arc' : 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, rpcUrls: { default: { http: [env.rpcUrl] } } });
export const addresses = { usdc: getAddress(env.usdc), factory: getAddress(env.factory), directory: getAddress(env.directory) } as const;
export const publicClient = createPublicClient({ chain: arc, transport: http(env.rpcUrl) });
export type ChamaDeployment = { chamaId: bigint; owner: Address; usdc: Address; registry: Address; insuranceFund: Address; vault: Address; lending: Address; name: string; metadataURI: string; active: boolean; acceptingMembers: boolean };
export function isConfiguredAddress(address: Address) { return address !== zero; }

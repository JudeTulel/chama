import { createPublicClient, http, defineChain, getAddress, type Address } from 'viem';

const zero = '0x0000000000000000000000000000000000000000' as Address;
const env = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 5042),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.mainnet.arc.io',
  usdc: process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000',
  factory: process.env.NEXT_PUBLIC_CHAMA_FACTORY_ADDRESS || '0x34dc2d41aa33679c829772bcfe5a55b01303ec9c',
  directory: process.env.NEXT_PUBLIC_CHAMA_DIRECTORY_ADDRESS || '0x373d946f6acd652cb886b9753f1420bf519ed452',
  directoryDeploymentBlock: BigInt(process.env.NEXT_PUBLIC_CHAMA_DIRECTORY_DEPLOYMENT_BLOCK || '25696600'),
  subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL || '',
};
export const arc = defineChain({ id: env.chainId, name: env.chainId === 5042002 ? 'Arc Testnet' : 'Arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, rpcUrls: { default: { http: [env.rpcUrl] } }, blockExplorers: env.chainId === 5042 ? { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } } : undefined });
export const addresses = { usdc: getAddress(env.usdc), factory: getAddress(env.factory), directory: getAddress(env.directory) } as const;
export const directoryDeploymentBlock = env.directoryDeploymentBlock;
export const subgraphUrl = env.subgraphUrl;
export const publicClient = createPublicClient({
  chain: arc,
  transport: http(env.rpcUrl, { retryCount: 3, retryDelay: 1_000, timeout: 30_000 }),
});
export type ChamaDeployment = { chamaId: bigint; owner: Address; usdc: Address; registry: Address; insuranceFund: Address; vault: Address; lending: Address; name: string; metadataURI: string; active: boolean; acceptingMembers: boolean };
export function isConfiguredAddress(address: Address) { return address !== zero; }

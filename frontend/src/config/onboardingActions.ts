import type { Address } from 'viem';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import type { Wallet } from '@dynamic-labs/sdk-react-core';
import { addresses, publicClient, type ChamaDeployment } from './contracts';
import { chamaFactoryAbi } from '../abi/ChamaFactory';
import { chamaDirectoryAbi } from '../abi/ChamaDirectory';
import { ensureWalletNetwork } from './networkActions';

export async function createChamaOnchain(wallet: Wallet): Promise<ChamaDeployment> {
  if (!isEthereumWallet(wallet)) throw new Error('Connect an EVM wallet to create a chama.');
  await ensureWalletNetwork(wallet, publicClient.chain.id);
  const client = await wallet.getWalletClient();
  if (client.chain?.id !== publicClient.chain?.id) throw new Error('Wallet is not using Arc Testnet after the network switch.');
  const owner = wallet.address as Address;
  const hash = await client.writeContract({ address: addresses.factory, abi: chamaFactoryAbi, functionName: 'createChama', args: [addresses.usdc, owner], chain: client.chain });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Chama deployment transaction reverted.');
  const created = await publicClient.getContractEvents({ address: addresses.factory, abi: chamaFactoryAbi, eventName: 'ChamaCreated', fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
  const creation = created.find(event => event.transactionHash === hash && event.args.owner?.toLowerCase() === owner.toLowerCase());
  if (creation?.args.id === undefined) throw new Error('Transaction confirmed, but the factory did not emit a matching ChamaCreated event.');
  const id = creation.args.id;
  const raw = await publicClient.readContract({ address: addresses.directory, abi: chamaDirectoryAbi, functionName: 'chamas', args: [id] });
  const entry = raw as readonly [Address, Address, Address, Address, Address, Address, string, string, boolean, boolean];
  if (!entry[8]) throw new Error(`Transaction confirmed, but the directory has no active chama entry for ID ${id}.`);
  if (entry[0].toLowerCase() !== owner.toLowerCase() || entry[1].toLowerCase() !== addresses.usdc.toLowerCase()) throw new Error('Created chama details do not match the connected wallet and configured USDC.');
  return { chamaId: id, owner: entry[0], usdc: entry[1], registry: entry[2], insuranceFund: entry[3], vault: entry[4], lending: entry[5], name: entry[6], metadataURI: entry[7], active: entry[8], acceptingMembers: entry[9] };
}

import { type Address, getAddress, createPublicClient, http } from 'viem';
import { arc } from '../../../src/config/contracts';
import { chamaLendingAbi } from '../../../src/abi/ChamaLending';
import { chamaVaultAbi } from '../../../src/abi/ChamaVault';
import { chamaDirectoryAbi } from '../../../src/abi/ChamaDirectory';
import { buildActivityFeed, getActivityScan, type ProfileActivityEvent } from '../../../src/config/profileActivityCore';

// ---- in-memory cache with TTL ----
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.data as T);
  return fn().then(data => {
    cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
    // evict oldest entries if cache grows past 50
    if (cache.size > 50) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].expires - b[1].expires)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    return data;
  });
}

// ---- constants ----
const MAX_SCAN_BLOCKS = BigInt(1_000_000);
const MAX_LOAN_RECORDS = 500;
const MAX_ACTIVITY_ITEMS = 200;
const BLOCK_WINDOW = BigInt(4_000);
const ZERO = BigInt(0);

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.testnet.arc.io';
const serverClient = createPublicClient({ chain: arc, transport: http(rpcUrl, { retryCount: 3, retryDelay: 1_000, timeout: 30_000 }) });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chamaIdStr = searchParams.get('chamaId');
  const accountStr = searchParams.get('account');
  const lendingStr = searchParams.get('lending');
  const vaultStr = searchParams.get('vault');
  const directoryStr = searchParams.get('directory');
  const usdcStr = searchParams.get('usdc');
  const directoryDeploymentStr = searchParams.get('directoryDeploymentBlock');

  if (!chamaIdStr || !accountStr || !lendingStr || !vaultStr || !directoryStr || !usdcStr) {
    return Response.json({ error: 'Missing required params: chamaId, account, lending, vault, directory, usdc' }, { status: 400 });
  }

  try {
    const chamaId = BigInt(chamaIdStr);
    const account = getAddress(accountStr);
    const lending = getAddress(lendingStr);
    const vault = getAddress(vaultStr);
    const directory = getAddress(directoryStr);
    const usdc = getAddress(usdcStr);
    const directoryDeploymentBlock = BigInt(directoryDeploymentStr || '64486284');

    const cacheKey = `${chamaIdStr}-${accountStr}`;
    const result = await cached(cacheKey, async () => {
      // 1. verify directory entry
      const selectedRecord = await serverClient.readContract({ address: directory, abi: chamaDirectoryAbi, functionName: 'chamas', args: [chamaId] });
      if (!selectedRecord[8]) throw new Error('Chama not active');

      // 2. get latest block + loan count
      const [latestBlock, nextLoanId] = await Promise.all([
        serverClient.getBlockNumber(),
        serverClient.readContract({ address: lending, abi: chamaLendingAbi, functionName: 'nextLoanId' }),
      ]);

      // 3. scan event logs in batches
      const scan = getActivityScan(directoryDeploymentBlock, latestBlock, MAX_SCAN_BLOCKS, BLOCK_WINDOW);
      const rawEvents: ProfileActivityEvent[] = [];

      for (const range of scan.ranges) {
        const [deposits, withdrawals, requests, guarantees, claims, approvals, activations, repayments, liquidations] = await Promise.all([
          serverClient.getContractEvents({ address: vault, abi: chamaVaultAbi, eventName: 'Deposited', args: { member: account }, fromBlock: range.fromBlock, toBlock: range.toBlock }),
          serverClient.getContractEvents({ address: vault, abi: chamaVaultAbi, eventName: 'Withdrawn', args: { member: account }, fromBlock: range.fromBlock, toBlock: range.toBlock }),
          serverClient.getContractEvents({ address: lending, abi: chamaLendingAbi, eventName: 'LoanRequested', args: { borrower: account }, fromBlock: range.fromBlock, toBlock: range.toBlock }),
          serverClient.getContractEvents({ address: lending, abi: chamaLendingAbi, eventName: 'Guaranteed', args: { guarantor: account }, fromBlock: range.fromBlock, toBlock: range.toBlock }),
          serverClient.getContractEvents({ address: lending, abi: chamaLendingAbi, eventName: 'InterestClaimed', args: { guarantor: account }, fromBlock: range.fromBlock, toBlock: range.toBlock }),
          serverClient.getContractEvents({ address: lending, abi: chamaLendingAbi, eventName: 'LoanApprovalUpdated', fromBlock: range.fromBlock, toBlock: range.toBlock }),
          serverClient.getContractEvents({ address: lending, abi: chamaLendingAbi, eventName: 'LoanActivated', fromBlock: range.fromBlock, toBlock: range.toBlock }),
          serverClient.getContractEvents({ address: lending, abi: chamaLendingAbi, eventName: 'Repaid', fromBlock: range.fromBlock, toBlock: range.toBlock }),
          serverClient.getContractEvents({ address: lending, abi: chamaLendingAbi, eventName: 'Liquidated', fromBlock: range.fromBlock, toBlock: range.toBlock }),
        ]);

        for (const log of deposits) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'deposit', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, amount: log.args.assets ?? ZERO });
        for (const log of withdrawals) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'withdrawal', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, amount: log.args.assets ?? ZERO });
        for (const log of requests) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'loan-request', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, amount: log.args.amount ?? ZERO });
        for (const log of guarantees) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'guarantee', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, shares: log.args.shares ?? ZERO });
        for (const log of claims) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'interest-claimed', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, amount: log.args.amount ?? ZERO });
        for (const log of approvals) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: log.args.approved ? 'loan-approved' : 'loan-revoked', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO });
        for (const log of activations) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'disbursed', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, amount: ZERO });
        for (const log of repayments) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'repaid', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, principal: log.args.principal ?? ZERO, interest: log.args.interest ?? ZERO });
        for (const log of liquidations) if (log.blockNumber && log.transactionHash) rawEvents.push({ type: 'liquidated', blockNumber: log.blockNumber, logIndex: log.logIndex ?? 0, transactionHash: log.transactionHash, loanId: log.args.id ?? ZERO, insuredAmount: log.args.insuredAmount ?? ZERO, collateralLoss: log.args.collateralLoss ?? ZERO });
      }

      // 4. enrich with loan principals from the lending contract
      const relatedLoanIds = new Set(rawEvents.filter(e => e.type === 'loan-request' || e.type === 'guarantee' || e.type === 'interest-claimed').map(e => e.loanId.toString()));
      const loanPrincipals = new Map<string, bigint>();
      const count = Number(nextLoanId > BigInt(MAX_LOAN_RECORDS) ? BigInt(MAX_LOAN_RECORDS) : nextLoanId);
      const firstId = nextLoanId - BigInt(count);
      const loanIds = Array.from({ length: count }, (_, i) => firstId + BigInt(i));
      for (let offset = 0; offset < loanIds.length; offset += 10) {
        const rows = await Promise.all(loanIds.slice(offset, offset + 10).map(async id => {
          const row = await serverClient.readContract({ address: lending, abi: chamaLendingAbi, functionName: 'loans', args: [id] });
          return { id, row };
        }));
        for (const { id, row } of rows) {
          loanPrincipals.set(id.toString(), row[1]);
          if (row[0].toLowerCase() === account.toLowerCase()) relatedLoanIds.add(id.toString());
        }
      }

      // 5. filter events to those the user is involved in
      const relevantEvents = rawEvents.filter(e => {
        if (['deposit', 'withdrawal', 'loan-request', 'guarantee', 'interest-claimed'].includes(e.type)) return true;
        return 'loanId' in e && relatedLoanIds.has(e.loanId.toString());
      });

      // 6. patch disbursed amounts with their corresponding loan principal
      const requestedAmounts = new Map<string, bigint>([...loanPrincipals]);
      for (const e of relevantEvents) if (e.type === 'loan-request') requestedAmounts.set(e.loanId.toString(), e.amount);
      const completedEvents = relevantEvents.map(e => {
        if (e.type !== 'disbursed') return e;
        const amount = requestedAmounts.get(e.loanId.toString());
        return amount === undefined ? e : { ...e, amount };
      });

      // 7. build feed + resolve block timestamps
      const feed = buildActivityFeed(completedEvents as ProfileActivityEvent[]);
      const visibleFeed = feed.slice(0, MAX_ACTIVITY_ITEMS);
      const blockNumbers = [...new Set(visibleFeed.map(e => e.blockNumber.toString()))];
      const timestamps = await Promise.all(blockNumbers.map(async b => [b, (await serverClient.getBlock({ blockNumber: BigInt(b) })).timestamp] as const));
      const timestampByBlock = new Map(timestamps);

      const serialized = visibleFeed.map(e => ({
        ...e,
        blockNumber: e.blockNumber.toString(),
        logIndex: e.logIndex,
        transactionHash: e.transactionHash,
        title: e.title,
        detail: e.detail,
        explorerUrl: e.explorerUrl,
        amount: e.amount?.toString(),
        // type-specific fields
        ...('loanId' in e ? { loanId: e.loanId.toString() } : {}),
        ...('principal' in e ? { principal: (e as any).principal?.toString() } : {}),
        ...('interest' in e ? { interest: (e as any).interest?.toString() } : {}),
        ...('shares' in e ? { shares: (e as any).shares?.toString() } : {}),
        ...('insuredAmount' in e ? { insuredAmount: (e as any).insuredAmount?.toString() } : {}),
        ...('collateralLoss' in e ? { collateralLoss: (e as any).collateralLoss?.toString() } : {}),
        timestamp: timestampByBlock.get(e.blockNumber.toString())?.toString(),
      }));

      return {
        events: serialized,
        partial: scan.partial || nextLoanId > BigInt(MAX_LOAN_RECORDS) || feed.length > MAX_ACTIVITY_ITEMS,
        cachedAt: new Date().toISOString(),
      };
    });

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    return Response.json({ error: message }, { status: 500 });
  }
}
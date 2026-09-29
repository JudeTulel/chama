type EventMeta = { blockNumber: bigint; logIndex: number; transactionHash: string };
export type ProfileActivityEvent =
  | (EventMeta & { type: 'deposit'; amount: bigint })
  | (EventMeta & { type: 'withdrawal'; amount: bigint })
  | (EventMeta & { type: 'loan-request'; loanId: bigint; amount: bigint })
  | (EventMeta & { type: 'loan-approved'; loanId: bigint })
  | (EventMeta & { type: 'loan-revoked'; loanId: bigint })
  | (EventMeta & { type: 'guarantee'; loanId: bigint; shares: bigint })
  | (EventMeta & { type: 'disbursed'; loanId: bigint; amount: bigint })
  | (EventMeta & { type: 'repaid'; loanId: bigint; principal: bigint; interest: bigint })
  | (EventMeta & { type: 'interest-claimed'; loanId: bigint; amount: bigint })
  | (EventMeta & { type: 'liquidated'; loanId: bigint; insuredAmount: bigint; collateralLoss: bigint });

export type ProfileActivityItem = {
  type: ProfileActivityEvent['type']; blockNumber: bigint; logIndex: number;
  transactionHash: string; title: string; detail: string; amount?: bigint; explorerUrl: string;
};

function formatTokenAmount(value: bigint): string {
  const whole = value / BigInt(1_000_000);
  const fraction = (value % BigInt(1_000_000)).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole.toLocaleString()}.${fraction}` : whole.toLocaleString();
}

export function getActivityScan(deploymentBlock: bigint, latestBlock: bigint, maxBlocks: bigint, blockWindow: bigint) {
  if (maxBlocks <= BigInt(0) || blockWindow <= BigInt(0)) throw new Error('Scan bounds must be positive.');
  const available = latestBlock >= deploymentBlock ? latestBlock - deploymentBlock + BigInt(1) : BigInt(0);
  const scanCount = available < maxBlocks ? available : maxBlocks;
  const fromBlock = scanCount === BigInt(0) ? deploymentBlock : latestBlock - scanCount + BigInt(1);
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let cursor = fromBlock; cursor <= latestBlock; cursor += blockWindow) {
    const candidate = cursor + blockWindow - BigInt(1);
    ranges.push({ fromBlock: cursor, toBlock: candidate < latestBlock ? candidate : latestBlock });
  }
  return { fromBlock, toBlock: latestBlock, ranges, partial: fromBlock > deploymentBlock };
}

function describe(event: ProfileActivityEvent): { title: string; detail: string; amount?: bigint } {
  switch (event.type) {
    case 'deposit': return { title: 'Vault deposit', detail: 'USDC deposited into the chama vault', amount: event.amount };
    case 'withdrawal': return { title: 'Vault withdrawal', detail: 'USDC withdrawn from the chama vault', amount: event.amount };
    case 'loan-request': return { title: `Loan request · #${event.loanId}`, detail: 'Loan requested', amount: event.amount };
    case 'loan-approved': return { title: `Loan approval · #${event.loanId}`, detail: 'Loan request approved' };
    case 'loan-revoked': return { title: `Loan approval revoked · #${event.loanId}`, detail: 'Loan approval revoked' };
    case 'guarantee': return { title: `Loan guarantee · #${event.loanId}`, detail: `${formatTokenAmount(event.shares)} cUSDC shares committed as collateral`, amount: event.shares };
    case 'disbursed': return { title: `Loan disbursement · #${event.loanId}`, detail: 'USDC disbursed to borrower', amount: event.amount };
    case 'repaid': return { title: `Loan repayment · #${event.loanId}`, detail: `Principal ${formatTokenAmount(event.principal)} · interest ${formatTokenAmount(event.interest)} USDC`, amount: event.principal + event.interest };
    case 'interest-claimed': return { title: `Guarantee interest claimed · #${event.loanId}`, detail: 'USDC paid to guarantor', amount: event.amount };
    case 'liquidated': return { title: `Loan liquidation · #${event.loanId}`, detail: `Insured ${formatTokenAmount(event.insuredAmount)} · collateral ${formatTokenAmount(event.collateralLoss)} USDC` };
  }
}

export function buildActivityFeed(events: ProfileActivityEvent[]): ProfileActivityItem[] {
  return events.map(event => ({
    ...event,
    ...describe(event),
    explorerUrl: `https://explorer.testnet.arc.io/tx/${event.transactionHash}`,
  })).sort((left, right) => left.blockNumber > right.blockNumber ? -1 : left.blockNumber < right.blockNumber ? 1 : right.logIndex - left.logIndex);
}

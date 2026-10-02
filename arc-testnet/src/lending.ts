import { BigInt, Address } from '@graphprotocol/graph-ts';
import { LoanRequested, LoanApprovalUpdated, Guaranteed, LoanActivated, Repaid, Liquidated } from '../generated/templates/ChamaLending/ChamaLending';
import { Chama, ContractIndex, Loan } from '../generated/schema';

function context(address: Address): Chama | null { let index = ContractIndex.load(address.toHexString()); return index == null ? null : Chama.load(index.chama); }
function loanFor(address: Address, id: BigInt): Loan | null { return Loan.load(address.toHexString() + '-' + id.toString()); }

export function handleLoanRequested(event: LoanRequested): void {
  let chama = context(event.address); if (chama == null) return;
  let loan = new Loan(event.address.toHexString() + '-' + event.params.id.toString());
  loan.chama = chama.id; loan.borrower = event.params.borrower; loan.principal = event.params.amount; loan.outstanding = event.params.amount;
  loan.lockedShares = BigInt.zero(); loan.borrowerLockedShares = BigInt.zero(); loan.status = 0; loan.createdAt = event.block.timestamp; loan.updatedAt = event.block.timestamp; loan.save();
}
export function handleLoanApprovalUpdated(event: LoanApprovalUpdated): void { let loan = loanFor(event.address, event.params.id); if (loan == null) return; loan.updatedAt = event.block.timestamp; loan.save(); }
export function handleGuaranteed(event: Guaranteed): void { let loan = loanFor(event.address, event.params.id); if (loan == null) return; loan.lockedShares = loan.lockedShares.plus(event.params.shares); loan.updatedAt = event.block.timestamp; loan.save(); }
export function handleLoanActivated(event: LoanActivated): void { let loan = loanFor(event.address, event.params.id); if (loan == null) return; loan.status = 1; loan.updatedAt = event.block.timestamp; loan.save(); }
export function handleRepaid(event: Repaid): void { let loan = loanFor(event.address, event.params.id); if (loan == null) return; loan.outstanding = BigInt.zero(); loan.status = 2; loan.updatedAt = event.block.timestamp; loan.save(); }
export function handleLiquidated(event: Liquidated): void { let loan = loanFor(event.address, event.params.id); if (loan == null) return; loan.outstanding = BigInt.zero(); loan.status = 4; loan.updatedAt = event.block.timestamp; loan.save(); }

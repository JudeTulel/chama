import { BigInt, Address } from '@graphprotocol/graph-ts';
import {
  ChamaRegistered, ChamaNameUpdated, InviteCreated, InviteRevoked,
  JoinRequested, JoinProcessed, ChamaStatusUpdated,
} from '../generated/ChamaDirectory/ChamaDirectory';
import { Chama, Invite, JoinRequest, ContractIndex } from '../generated/schema';
import { ChamaDirectory } from '../generated/ChamaDirectory/ChamaDirectory';
import { ChamaLending } from '../generated/templates';


function chamaKey(id: BigInt): string { return id.toString(); }
function requestKey(chamaId: BigInt, applicant: Address): string { return chamaId.toString() + '-' + applicant.toHexString(); }

export function handleChamaRegistered(event: ChamaRegistered): void {
  let chama = new Chama(chamaKey(event.params.chamaId));
  chama.chamaId = event.params.chamaId;
  chama.owner = event.params.owner;
  chama.usdc = Address.zero();
  chama.registry = event.params.registry;
  chama.insuranceFund = Address.zero();
  chama.vault = Address.zero();
  chama.lending = Address.zero();
  chama.name = event.params.name;
  chama.metadataURI = '';
  chama.active = true;
  chama.acceptingMembers = true;
  chama.createdAt = event.block.timestamp;
  chama.createdBlock = event.block.number;

  let directory = ChamaDirectory.bind(event.address);
  let result = directory.try_chamas(event.params.chamaId);
  if (!result.reverted) {
    let data = result.value;
    chama.usdc = data.value1;
    chama.registry = data.value2;
    chama.insuranceFund = data.value3;
    chama.vault = data.value4;
    chama.lending = data.value5;
    let index = new ContractIndex(data.value5.toHexString());
    index.chama = chama.id;
    index.save();
    ChamaLending.create(data.value5);
  }
  chama.save();
}

export function handleChamaNameUpdated(event: ChamaNameUpdated): void {
  let chama = Chama.load(chamaKey(event.params.chamaId));
  if (chama == null) return;
  chama.name = event.params.name;
  chama.save();
}

export function handleInviteCreated(event: InviteCreated): void {
  let invite = new Invite(event.params.codeHash.toHexString());
  invite.codeHash = event.params.codeHash;
  invite.chama = chamaKey(event.params.chamaId);
  invite.expiresAt = event.params.expiresAt;
  invite.maxUses = event.params.maxUses;
  invite.uses = BigInt.zero();
  invite.active = true;
  invite.createdAt = event.block.timestamp;
  invite.save();
}

export function handleInviteRevoked(event: InviteRevoked): void {
  let invite = Invite.load(event.params.codeHash.toHexString());
  if (invite == null) return;
  invite.active = false;
  invite.revokedAt = event.block.timestamp;
  invite.save();
}

export function handleJoinRequested(event: JoinRequested): void {
  let request = new JoinRequest(requestKey(event.params.chamaId, event.params.applicant));
  request.chama = chamaKey(event.params.chamaId);
  request.applicant = event.params.applicant;
  request.codeHash = event.params.codeHash;
  request.createdAt = event.block.timestamp;
  request.processed = false;
  request.approved = false;
  request.requestedAt = event.block.timestamp;
  request.requestedBlock = event.block.number;
  request.save();
}

export function handleJoinProcessed(event: JoinProcessed): void {
  let request = JoinRequest.load(requestKey(event.params.chamaId, event.params.applicant));
  if (request == null) return;
  request.processed = true;
  request.approved = event.params.approved;
  request.processedAt = event.block.timestamp;
  request.save();
}

export function handleChamaStatusUpdated(event: ChamaStatusUpdated): void {
  let chama = Chama.load(chamaKey(event.params.chamaId));
  if (chama == null) return;
  chama.active = event.params.active;
  chama.acceptingMembers = event.params.acceptingMembers;
  chama.save();
}

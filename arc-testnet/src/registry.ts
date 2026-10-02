import { Address } from '@graphprotocol/graph-ts';
import { MemberStatusChanged } from '../generated/MembershipRegistry/MembershipRegistry';
import { Member } from '../generated/schema';

export function handleMemberStatusChanged(event: MemberStatusChanged): void {
  let id = event.address.toHexString() + '-' + event.params.account.toHexString();
  let member = Member.load(id);
  if (member == null) {
    member = new Member(id);
    member.chama = event.address.toHexString();
  }
  member.account = event.params.account;
  member.active = event.params.active;
  member.updatedAt = event.block.timestamp;
  member.updatedBlock = event.block.number;
  member.save();
}

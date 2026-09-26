// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MembershipRegistry} from "./MembershipRegistry.sol";

/// @notice Global chama discovery, invite-code, and membership-request registry.
contract ChamaDirectory is Ownable {
    struct ChamaInfo {
        address owner;
        address usdc;
        address registry;
        address insuranceFund;
        address vault;
        address lending;
        string name;
        string metadataURI;
        bool active;
        bool acceptingMembers;
    }

    struct Invite {
        uint256 chamaId;
        uint256 expiresAt;
        uint256 maxUses;
        uint256 uses;
        bool active;
    }

    struct JoinRequest {
        uint256 createdAt;
        bool processed;
        bool approved;
    }

    address public immutable factory;
    uint256 public nextChamaId;
    mapping(uint256 => ChamaInfo) public chamas;
    mapping(bytes32 => Invite) public invites;
    mapping(uint256 => mapping(address => JoinRequest)) public joinRequests;

    error Unauthorized();
    error Invalid();
    error NotFound();
    error Closed();
    error AlreadyMember();

    event ChamaRegistered(uint256 indexed chamaId, address indexed owner, address registry, string name);
    event InviteCreated(bytes32 indexed codeHash, uint256 indexed chamaId, uint256 expiresAt, uint256 maxUses);
    event InviteRevoked(bytes32 indexed codeHash);
    event JoinRequested(uint256 indexed chamaId, address indexed applicant, bytes32 indexed codeHash);
    event JoinProcessed(uint256 indexed chamaId, address indexed applicant, bool approved);
    event ChamaStatusUpdated(uint256 indexed chamaId, bool active, bool acceptingMembers);

    modifier onlyFactory() {
        if (msg.sender != factory) revert Unauthorized();
        _;
    }

    modifier chamaOwner(uint256 chamaId) {
        if (chamas[chamaId].owner != msg.sender) revert Unauthorized();
        _;
    }

    constructor(address factory_, address owner_) Ownable(owner_) {
        if (factory_ == address(0)) revert Invalid();
        factory = factory_;
    }

    function registerChama(
        address owner_,
        address usdc_,
        address registry_,
        address insuranceFund_,
        address vault_,
        address lending_,
        string calldata name_,
        string calldata metadataURI_
    ) external onlyFactory returns (uint256 chamaId) {
        if (owner_ == address(0) || registry_ == address(0) || vault_ == address(0) || lending_ == address(0)) revert Invalid();
        chamaId = nextChamaId++;
        chamas[chamaId] = ChamaInfo(owner_, usdc_, registry_, insuranceFund_, vault_, lending_, name_, metadataURI_, true, true);
        emit ChamaRegistered(chamaId, owner_, registry_, name_);
    }

    function createInvite(uint256 chamaId, bytes32 codeHash, uint256 expiresAt, uint256 maxUses) external chamaOwner(chamaId) {
        if (codeHash == bytes32(0) || (expiresAt != 0 && expiresAt <= block.timestamp) || maxUses == 0) revert Invalid();
        invites[codeHash] = Invite(chamaId, expiresAt, maxUses, 0, true);
        emit InviteCreated(codeHash, chamaId, expiresAt, maxUses);
    }

    function revokeInvite(bytes32 codeHash) external {
        Invite storage invite = invites[codeHash];
        if (invite.active == false || chamas[invite.chamaId].owner != msg.sender) revert Unauthorized();
        invite.active = false;
        emit InviteRevoked(codeHash);
    }

    function setChamaStatus(uint256 chamaId, bool active, bool acceptingMembers) external chamaOwner(chamaId) {
        ChamaInfo storage chama = chamas[chamaId];
        chama.active = active;
        chama.acceptingMembers = acceptingMembers;
        emit ChamaStatusUpdated(chamaId, active, acceptingMembers);
    }

    function requestJoin(bytes32 codeHash) external {
        Invite storage invite = invites[codeHash];
        if (!invite.active || (invite.expiresAt != 0 && block.timestamp > invite.expiresAt) || invite.uses >= invite.maxUses) revert Invalid();
        ChamaInfo storage chama = chamas[invite.chamaId];
        if (!chama.active || !chama.acceptingMembers) revert Closed();
        if (MembershipRegistry(chama.registry).isMember(msg.sender)) revert AlreadyMember();
        JoinRequest storage request = joinRequests[invite.chamaId][msg.sender];
        if (request.createdAt != 0 && !request.processed) revert Invalid();
        request.createdAt = block.timestamp;
        request.processed = false;
        request.approved = false;
        invite.uses++;
        emit JoinRequested(invite.chamaId, msg.sender, codeHash);
    }

    function approveJoin(uint256 chamaId, address applicant, bool approved) external chamaOwner(chamaId) {
        JoinRequest storage request = joinRequests[chamaId][applicant];
        if (request.createdAt == 0 || request.processed) revert NotFound();
        request.processed = true;
        request.approved = approved;
        emit JoinProcessed(chamaId, applicant, approved);
        if (approved) MembershipRegistry(chamas[chamaId].registry).approveMember(applicant);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Explicit member allowlist for the cooperative.
contract MembershipRegistry is Ownable {
    error ZeroMember();
    mapping(address => bool) public isMember;
    address public membershipManager;
    event MemberStatusChanged(address indexed account, bool active);
    event MembershipManagerSet(address indexed manager);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setMembershipManager(address manager) external onlyOwner {
        require(manager != address(0), "zero manager");
        membershipManager = manager;
        emit MembershipManagerSet(manager);
    }

    function approveMember(address account) external {
        require(msg.sender == owner() || msg.sender == membershipManager, "not manager");
        if (account == address(0)) revert ZeroMember();
        isMember[account] = true;
        emit MemberStatusChanged(account, true);
    }

    function setMember(address account, bool active) external onlyOwner {
        if (account == address(0)) revert ZeroMember();
        isMember[account] = active;
        emit MemberStatusChanged(account, active);
    }

    function setMembers(address[] calldata accounts, bool active) external onlyOwner {
        for (uint256 i; i < accounts.length; ++i) {
            if (accounts[i] == address(0)) revert ZeroMember();
            isMember[accounts[i]] = active;
            emit MemberStatusChanged(accounts[i], active);
        }
    }
}

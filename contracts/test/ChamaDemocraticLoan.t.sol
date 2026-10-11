// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "./MockUSDC.sol";
import {MembershipRegistry} from "../src/MembershipRegistry.sol";
import {ChamaVault} from "../src/ChamaVault.sol";
import {ChamaLending} from "../src/ChamaLending.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";

contract ChamaDemocraticLoanTest is Test {
    MockUSDC usdc; MembershipRegistry registry; InsuranceFund insurance; ChamaVault vault; ChamaLending lending;
    address owner = address(1); address borrower = address(2); address guarantor = address(3); address treasury = address(4);
    address member1 = address(5); address member2 = address(6); address outsider = address(9);

    function setUp() public {
        usdc = new MockUSDC();
        registry = new MembershipRegistry(owner);
        insurance = new InsuranceFund(address(usdc), owner);
        vault = new ChamaVault(address(usdc), address(registry), address(insurance), owner);
        lending = new ChamaLending(address(vault), address(registry), treasury, owner);
        vm.startPrank(owner);
        insurance.setVault(address(vault));
        vault.setLendingModule(address(lending));
        insurance.setLendingModule(address(lending));
        address[] memory m = new address[](4);
        m[0] = borrower; m[1] = guarantor; m[2] = member1; m[3] = member2;
        registry.setMembers(m, true);
        vm.stopPrank();
        usdc.mint(borrower, 1_000e6); usdc.mint(guarantor, 1_000e6);
        usdc.mint(member1, 1_000e6); usdc.mint(member2, 1_000e6); usdc.mint(outsider, 1_000e6);
    }

    function _deposit(address who, uint256 amt) internal {
        vm.startPrank(who); usdc.approve(address(vault), amt); vault.deposit(amt); vm.stopPrank();
    }

    function _pendingLoan() internal returns (uint256 id) {
        _deposit(borrower, 101e6);
        _deposit(guarantor, 101e6);
        _deposit(member1, 100e6);
        _deposit(member2, 100e6);
        vm.prank(borrower);
        id = lending.requestLoan(100e6, 1_000, block.timestamp + 30 days, "QmReasonHashForLoan");
    }

    function _activeLoan() internal returns (uint256 id) {
        id = _pendingLoan();
        vm.prank(member1); lending.voteOnLoan(id, true);
        vm.prank(member2); lending.voteOnLoan(id, true);
        vm.warp(block.timestamp + 16 hours + 1);
        lending.checkVotingComplete(id);
        vm.prank(borrower); lending.activate(id);
    }

    function testRequestLoanWithReason() public {
        _deposit(borrower, 101e6);
        vm.prank(borrower);
        uint256 id = lending.requestLoan(100e6, 1_000, block.timestamp + 30 days, "QmReasonHashForLoan");
        (,,,,,,,,,,string memory ipfsHash,) = lending.loans(id);
        assertEq(ipfsHash, "QmReasonHashForLoan");
    }

    function testRequestLoanWithLongReasonReverts() public {
        _deposit(borrower, 101e6);
        string memory longReason = "This is a very long reason that exceeds 300 characters. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.";
        vm.prank(borrower);
        vm.expectRevert(ChamaLending.Invalid.selector);
        lending.requestLoan(100e6, 1_000, block.timestamp + 30 days, longReason);
    }

    function testVoteOnLoanApproves() public {
        uint256 id = _pendingLoan();
        vm.prank(member1); lending.voteOnLoan(id, true);
        vm.prank(member2); lending.voteOnLoan(id, true);
        vm.warp(block.timestamp + 16 hours + 1);
        lending.checkVotingComplete(id);
        (, , , , , , , , bool approved, , , ) = lending.loans(id); // 12 fields
        assertTrue(approved);
    }

    function testVoteOnLoanRejects() public {
        uint256 id = _pendingLoan();
        vm.prank(member1); lending.voteOnLoan(id, false);
        vm.prank(member2); lending.voteOnLoan(id, false);
        vm.warp(block.timestamp + 16 hours + 1);
        lending.checkVotingComplete(id);
        (, , , , , , , , bool approved, , , ) = lending.loans(id); // 12 fields
        assertFalse(approved);
    }

    function testLoanActivationFailsIfNotApproved() public {
        uint256 id = _pendingLoan();
        vm.prank(member1); lending.voteOnLoan(id, true);
        vm.prank(member2); lending.voteOnLoan(id, true);
        vm.warp(block.timestamp + 16 hours + 1);
        lending.checkVotingComplete(id);
        (, , , , , , , , bool approved, , , ) = lending.loans(id); // 12 fields
        assertTrue(approved);
        vm.prank(guarantor); lending.guarantee(id, 99e6);
        vm.prank(borrower); lending.activate(id);
        (, , , , , , , , , ChamaLending.Status status, , ) = lending.loans(id);
        assertEq(uint256(status), uint256(ChamaLending.Status.Active));
    }

    function testLoanActivationFailsIfRejected() public {
        uint256 id = _pendingLoan();
        vm.prank(member1); lending.voteOnLoan(id, false);
        vm.prank(member2); lending.voteOnLoan(id, true);
        vm.warp(block.timestamp + 16 hours + 1);
        lending.checkVotingComplete(id);
        (, , , , , , , , bool approved, , , ) = lending.loans(id); // 12 fields
        assertFalse(approved);
        vm.prank(borrower);
        vm.expectRevert(ChamaLending.Invalid.selector);
        lending.activate(id);
    }

    function testGuaranteeFailsIfVotingPeriodEndedAndNotApproved() public {
        uint256 id = _pendingLoan();
        vm.warp(block.timestamp + 16 hours + 1);
        lending.checkVotingComplete(id);
        vm.prank(guarantor);
        vm.expectRevert(ChamaLending.Invalid.selector);
        lending.guarantee(id, 50e6);
    }

    function testLoanActivationFailsIfVotingPeriodNotEnded() public {
        uint256 id = _pendingLoan();
        vm.prank(member1); lending.voteOnLoan(id, true);
        vm.prank(borrower);
        vm.expectRevert(ChamaLending.Invalid.selector);
        lending.activate(id);
    }

    function testCheckVotingCompleteBeforePeriodEndsReverts() public {
        uint256 id = _pendingLoan();
        vm.prank(member1); lending.voteOnLoan(id, true);
        vm.expectRevert(ChamaLending.Invalid.selector);
        lending.checkVotingComplete(id);
    }

    function testCheckVotingCompleteAfterPeriodEnds() public {
        uint256 id = _pendingLoan();
        vm.prank(member1); lending.voteOnLoan(id, true);
        vm.warp(block.timestamp + 16 hours + 1);
        lending.checkVotingComplete(id);
        (, , , , , , , , bool approved, , , ) = lending.loans(id); // 12 fields
        assertTrue(approved);
    }

    function testDoubleVoteReverts() public {
        uint256 id = _pendingLoan();
        vm.prank(member1); lending.voteOnLoan(id, true);
        vm.prank(member1);
        vm.expectRevert(ChamaLending.Invalid.selector);
        lending.voteOnLoan(id, false);
    }

    function testNonMemberVoteReverts() public {
        uint256 id = _pendingLoan();
        vm.prank(outsider);
        vm.expectRevert(ChamaLending.NotMember.selector);
        lending.voteOnLoan(id, true);
    }

    function testVoteAfterPeriodEndsReverts() public {
        uint256 id = _pendingLoan();
        vm.warp(block.timestamp + 16 hours + 1);
        vm.prank(member1);
        vm.expectRevert(ChamaLending.Invalid.selector);
        lending.voteOnLoan(id, true);
    }
}

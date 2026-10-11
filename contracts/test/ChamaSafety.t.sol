// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "./MockUSDC.sol";
import {MembershipRegistry} from "../src/MembershipRegistry.sol";
import {ChamaVault} from "../src/ChamaVault.sol";
import {ChamaLending} from "../src/ChamaLending.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";

contract ChamaSafetyTest is Test {
    MockUSDC usdc; MembershipRegistry registry; InsuranceFund insurance; ChamaVault vault; ChamaLending lending;
    address owner = address(1); address borrower = address(2); address guarantor = address(3); address treasury = address(4);
    address outsider = address(9); address member1 = address(5);

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
        address[] memory m = new address[](3); m[0] = borrower; m[1] = guarantor; m[2] = member1;
        registry.setMembers(m, true);
        vm.stopPrank();
        usdc.mint(borrower, 1_000e6); usdc.mint(guarantor, 1_000e6); usdc.mint(outsider, 1_000e6);
    }

    function _deposit(address who, uint256 amt) internal {
        vm.startPrank(who); usdc.approve(address(vault), amt); vault.deposit(amt); vm.stopPrank();
    }

    function _pendingLoan() internal returns (uint256 id) {
        _deposit(borrower, 101e6);
        _deposit(guarantor, 101e6);
        vm.prank(borrower); id = lending.requestLoan(100e6, 1_000, block.timestamp + 30 days, "QmReason");
        vm.prank(guarantor); lending.guarantee(id, 99e6);
        vm.prank(borrower); lending.voteOnLoan(id, true);
        vm.prank(guarantor); lending.voteOnLoan(id, true);
    }

    function _activeLoan() internal returns (uint256 id) {
        id = _pendingLoan();
        vm.warp(block.timestamp + 16 hours + 1);
        lending.checkVotingComplete(id);
        vm.prank(borrower); lending.activate(id);
    }

    function testCancelGuaranteeReleasesSharesOnPendingLoan() public {
        uint256 id = _pendingLoan();
        assertEq(vault.balanceOf(guarantor), 99_990_000 - 99e6);
        vm.prank(guarantor); lending.cancelGuarantee(id);
        assertEq(vault.balanceOf(guarantor), 99_990_000);
        (, , , , , , uint256 locked, , , , , ) = lending.loans(id); // 12 fields
        assertEq(locked, 0);
    }

    function testCancelGuaranteeRevertsAfterActivation() public {
        uint256 id = _activeLoan();
        vm.prank(guarantor); vm.expectRevert();
        lending.cancelGuarantee(id);
    }

    function testCancelGuaranteeRevertsWithoutGuarantee() public {
        uint256 id = _pendingLoan();
        vm.prank(outsider); vm.expectRevert();
        lending.cancelGuarantee(id);
    }

    function testActivateUsesAssetValueWhenSharePriceRises() public {
        _deposit(borrower, 101e6);
        _deposit(guarantor, 101e6);
        usdc.mint(owner, 50e6);
        vm.prank(owner); usdc.transfer(address(vault), 50e6);
        vm.prank(borrower); uint256 id = lending.requestLoan(100e6, 1_000, block.timestamp + 30 days, "QmReason");
        uint256 guarantorShares = vault.balanceOf(guarantor) * 2 / 3;
        vm.prank(guarantor); lending.guarantee(id, guarantorShares);
        vm.prank(borrower); lending.voteOnLoan(id, true);
        vm.prank(member1); lending.voteOnLoan(id, true);
        vm.warp(block.timestamp + 16 hours + 1);
        lending.checkVotingComplete(id);
        vm.prank(borrower); lending.activate(id);
        assertEq(usdc.balanceOf(borrower), 1_000e6 - 101e6 + 100e6);
    }

    function testActivateRevertsWhenAssetsInsufficient() public {
        _deposit(borrower, 20e6);
        _deposit(guarantor, 101e6);
        vm.prank(borrower); uint256 id = lending.requestLoan(50e6, 1_000, block.timestamp + 30 days, "QmReason");
        vm.prank(guarantor); lending.guarantee(id, 10e6);
        vm.prank(borrower); lending.voteOnLoan(id, true);
        vm.prank(member1); lending.voteOnLoan(id, true);
        vm.warp(block.timestamp + 16 hours + 1);
        lending.checkVotingComplete(id);
        vm.prank(borrower); vm.expectRevert(ChamaLending.InsufficientCollateral.selector);
        lending.activate(id);
    }

    function testOverpaymentRefundedAsShares() public {
        uint256 id = _activeLoan();
        vm.warp(block.timestamp + 10 days);
        uint256 interest = lending.accruedInterest(id);
        uint256 owed = 100e6 + interest;
        uint256 extra = 5e6;
        usdc.mint(borrower, owed + extra);
        (, , , , , , , uint256 borrowerLockedShares, , , , ) = lending.loans(id); // 12 fields
        vm.startPrank(borrower); usdc.approve(address(lending), owed + extra); lending.repay(id, owed + extra); vm.stopPrank();
        uint256 refundShares = vault.balanceOf(borrower) - borrowerLockedShares;
        assertGt(refundShares, 0);
        assertApproxEqAbs(vault.convertToAssets(refundShares), extra, 2);
    }

    function testExactRepaymentMintsNoRefund() public {
        uint256 id = _activeLoan();
        vm.warp(block.timestamp + 10 days);
        uint256 owed = 100e6 + lending.accruedInterest(id);
        usdc.mint(borrower, owed);
        assertEq(vault.balanceOf(borrower), 0);
        vm.startPrank(borrower); usdc.approve(address(lending), owed); lending.repay(id, owed); vm.stopPrank();
        assertEq(vault.balanceOf(borrower), 99_990_000);
    }

    function testLendingModuleChangeIsTimelocked() public {
        vm.prank(owner); vault.setLendingModule(outsider);
        assertEq(vault.lendingModule(), address(lending));
        assertEq(vault.pendingLendingModule(), outsider);
        vm.prank(owner); vm.expectRevert(ChamaVault.NotReady.selector);
        vault.executeLendingModule();
        vm.warp(block.timestamp + 2 days);
        vm.prank(owner); vault.executeLendingModule();
        assertEq(vault.lendingModule(), outsider);
    }

    function testLendingModuleProposalCanBeCancelled() public {
        vm.prank(owner); vault.setLendingModule(outsider);
        vm.prank(owner); vault.cancelLendingModule();
        vm.warp(block.timestamp + 3 days);
        vm.prank(owner); vm.expectRevert(ChamaVault.NoPendingModule.selector);
        vault.executeLendingModule();
        assertEq(vault.lendingModule(), address(lending));
    }

    function testInsuranceModuleChangeIsTimelocked() public {
        vm.prank(owner); insurance.setLendingModule(outsider);
        assertEq(insurance.lendingModule(), address(lending));
    }

    function testNonOwnerCannotProposeModule() public {
        vm.prank(outsider); vm.expectRevert();
        vault.setLendingModule(outsider);
    }

    function testPauseBlocksDepositsThenLapses() public {
        vm.prank(owner); vault.pause();
        vm.startPrank(borrower); usdc.approve(address(vault), 10e6);
        vm.expectRevert(); vault.deposit(10e6);
        vm.stopPrank();
        vm.warp(block.timestamp + 7 days + 1);
        _deposit(borrower, 10e6);
        assertGt(vault.balanceOf(borrower), 0);
    }

    function testNonMemberCannotDeposit() public {
        vm.startPrank(outsider); usdc.approve(address(vault), 10e6);
        vm.expectRevert(ChamaVault.NotMember.selector);
        vault.deposit(10e6);
        vm.stopPrank();
    }

    function testWithdrawCannotExceedLiquidity() public {
        _deposit(borrower, 101e6);
        vm.prank(borrower); vm.expectRevert(ChamaVault.InsufficientLiquidity.selector);
        vault.withdraw(1_000e6);
    }

    function testWithdrawReturnsUsdc() public {
        _deposit(borrower, 101e6);
        uint256 before = usdc.balanceOf(borrower);
        vm.prank(borrower); vault.withdraw(50e6);
        assertEq(usdc.balanceOf(borrower), before + 50e6);
    }

    function testGuarantorClaimsInterestAfterRepay() public {
        uint256 id = _activeLoan();
        vm.warp(block.timestamp + 10 days);
        uint256 interest = lending.accruedInterest(id);
        uint256 owed = 100e6 + interest;
        usdc.mint(borrower, owed);
        vm.startPrank(borrower); usdc.approve(address(lending), owed); lending.repay(id, owed); vm.stopPrank();
        uint256 before = usdc.balanceOf(guarantor);
        vm.prank(guarantor); lending.claimGuaranteeInterest(id);
        assertEq(usdc.balanceOf(guarantor), before + interest * 5_000 / 10_000);
    }

    function testClaimWithNothingOwedReverts() public {
        uint256 id = _activeLoan();
        vm.prank(outsider); vm.expectRevert(ChamaLending.Invalid.selector);
        lending.claimGuaranteeInterest(id);
    }

    function testLiquidationAfterGraceClearsPrincipal() public {
        uint256 id = _activeLoan();
        vm.prank(outsider); vm.expectRevert(ChamaLending.Invalid.selector);
        lending.liquidate(id);
        vm.warp(block.timestamp + 30 days + 1 days + 1);
        uint256 insuranceBefore = usdc.balanceOf(address(insurance));
        vm.prank(outsider); lending.liquidate(id);
        (, , , , , , , , , ChamaLending.Status status, , ) = lending.loans(id); // 12 fields
        assertEq(uint256(status), uint256(ChamaLending.Status.Liquidated));
        assertEq(vault.outstandingPrincipal(), 0);
        assertLt(usdc.balanceOf(address(insurance)), insuranceBefore);
    }

    function testLiquidationRevertsWhenNotActive() public {
        uint256 id = _pendingLoan();
        vm.warp(block.timestamp + 60 days);
        vm.expectRevert(ChamaLending.Invalid.selector);
        lending.liquidate(id);
    }

    function testLendingPausedBlocksRequests() public {
        _deposit(borrower, 101e6);
        vm.prank(owner); lending.pause();
        vm.prank(borrower); vm.expectRevert();
        lending.requestLoan(10e6, 1_000, block.timestamp + 30 days, "QmReason");
    }
}

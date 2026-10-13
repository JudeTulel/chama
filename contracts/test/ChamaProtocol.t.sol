// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "./MockUSDC.sol";
import {MembershipRegistry} from "../src/MembershipRegistry.sol";
import {ChamaVault} from "../src/ChamaVault.sol";
import {ChamaLending} from "../src/ChamaLending.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";
import {ChamaFactory} from "../src/ChamaFactory.sol";
import {ChamaDirectory} from "../src/ChamaDirectory.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ChamaProtocolTest is Test {
    MockUSDC usdc; MembershipRegistry registry; InsuranceFund insurance; ChamaVault vault; ChamaLending lending;
    address owner = address(1); address borrower = address(2); address guarantor = address(3); address treasury = address(4);
    function setUp() public {
        usdc = new MockUSDC(); registry = new MembershipRegistry(owner); insurance = new InsuranceFund(address(usdc), owner); vault = new ChamaVault(address(usdc), address(registry), address(insurance), owner); lending = new ChamaLending(address(vault), address(registry), treasury, owner);
        vm.startPrank(owner); insurance.setVault(address(vault)); vault.setLendingModule(address(lending)); insurance.setLendingModule(address(lending)); vm.stopPrank();
        vm.prank(owner); registry.setMembers(_members(), true);
        usdc.mint(borrower, 1_000e6); usdc.mint(guarantor, 1_000e6);
    }
    function _members() internal view returns (address[] memory a) { a = new address[](2); a[0] = borrower; a[1] = guarantor; }
    function testFactoryCreatorOwnsChama() public {
        ChamaFactory factory = new ChamaFactory();
        vm.prank(owner);
        uint256 id = factory.createChama(address(usdc), treasury, "Test Chama");
        (address createdOwner, address token, address createdTreasury, address registryAddress, address insuranceAddress, address vaultAddress, address lendingAddress) = factory.chamas(id);
        ChamaFactory.Chama memory created = ChamaFactory.Chama(createdOwner, token, createdTreasury, registryAddress, insuranceAddress, vaultAddress, lendingAddress);
        assertEq(created.owner, owner);
        assertFalse(MembershipRegistry(created.registry).isMember(owner));
        assertEq(Ownable(created.registry).owner(), owner);
        assertEq(Ownable(created.vault).owner(), owner);
        assertEq(Ownable(created.lending).owner(), owner);
        vm.prank(owner);
        MembershipRegistry(created.registry).setMember(owner, true);
        assertTrue(MembershipRegistry(created.registry).isMember(owner));
    }

    function testJoinCodeRequestAndOwnerApproval() public {
        ChamaFactory factory = new ChamaFactory();
        bytes32 codeHash = keccak256(abi.encodePacked("NAIROBI-7K4Q2M"));
        vm.prank(owner);
        uint256 id = factory.createChama(address(usdc), treasury, "Test Chama");
        (address createdOwner, address token, address createdTreasury, address registryAddress, address insuranceAddress, address vaultAddress, address lendingAddress) = factory.chamas(id);
        ChamaFactory.Chama memory created = ChamaFactory.Chama(createdOwner, token, createdTreasury, registryAddress, insuranceAddress, vaultAddress, lendingAddress);
        ChamaDirectory directory = ChamaDirectory(factory.directory());
        vm.prank(owner); directory.createInvite(0, codeHash, block.timestamp + 7 days, 10);
        vm.prank(guarantor); directory.requestJoin(codeHash);
        vm.prank(owner); directory.approveJoin(0, guarantor, true);
        assertTrue(MembershipRegistry(created.registry).isMember(guarantor));
    }

    function testOwnerCanRenameChama() public {
        ChamaFactory factory = new ChamaFactory();
        vm.prank(owner);
        factory.createChama(address(usdc), treasury, "Nairobi Women Savers");
        ChamaDirectory directory = ChamaDirectory(factory.directory());

        vm.prank(owner);
        directory.setChamaName(0, "Nairobi Women Savers Club");

        (,,,,,, string memory name,,,) = directory.chamas(0);
        assertEq(name, "Nairobi Women Savers Club");
    }

    function testNamedCreationStoresTheProvidedName() public {
        ChamaFactory factory = new ChamaFactory();
        vm.prank(owner);
        factory.createChama(address(usdc), treasury, "Nairobi Women Savers");
        ChamaDirectory directory = ChamaDirectory(factory.directory());

        (,,,,,, string memory name,,,) = directory.chamas(0);
        assertEq(name, "Nairobi Women Savers");
    }

    function testDepositInsuranceFee() public {
        vm.startPrank(borrower); usdc.approve(address(vault), 100e6); vault.deposit(100e6); vm.stopPrank();
        assertEq(usdc.balanceOf(address(insurance)), 1e6);
        assertEq(vault.balanceOf(borrower), 99e6);
    }

    function testInterestAndMaturitySyncWithActivation() public {
        vm.startPrank(borrower); usdc.approve(address(vault), 101e6); vault.deposit(101e6); vm.stopPrank();
        vm.startPrank(guarantor); usdc.approve(address(vault), 101e6); vault.deposit(101e6); vault.approve(address(lending), 99e6); vm.stopPrank();
        uint256 requestedAt = vm.getBlockTimestamp();
        vm.prank(borrower); uint256 id = lending.requestLoan(100e6, 1_000, 30 days); // 30-day term
        vm.prank(guarantor); lending.guarantee(id, 99e6);
        vm.prank(owner); lending.approveLoan(id, true);
        vm.warp(requestedAt + 5 days); // pending: nothing accrues, maturity not set
        assertEq(lending.accruedInterest(id), 0);
        (, , , , , uint256 activatedAt, uint256 term, uint256 maturity, , , , ) = lending.loans(id);
        assertEq(maturity, 0);
        vm.prank(borrower); lending.activate(id);
        assertEq(lending.accruedInterest(id), 0);
        (, , , , , activatedAt, term, maturity, , , , ) = lending.loans(id);
        assertEq(term, 30 days);
        assertEq(activatedAt, requestedAt + 5 days);
        assertEq(maturity, requestedAt + 5 days + 30 days); // anchored at activation, not request
        vm.warp(requestedAt + 5 days + 10 days);
        uint256 expected = (100e6 * 1_000 * uint256(10 days)) / 10_000 / uint256(365 days);
        assertEq(lending.accruedInterest(id), expected);
        vm.warp(requestedAt + 5 days + 40 days); // past maturity: interest caps at maturity
        uint256 capped = (100e6 * 1_000 * uint256(30 days)) / 10_000 / uint256(365 days);
        assertEq(lending.accruedInterest(id), capped);
    }

    function testDepositSharesAndRepayLoan() public {
        vm.startPrank(borrower); usdc.approve(address(vault), 101e6); vault.deposit(101e6); vm.stopPrank();
        vm.startPrank(guarantor); usdc.approve(address(vault), 101e6); vault.deposit(101e6); vault.approve(address(lending), 99e6); vm.stopPrank();
        vm.prank(borrower); uint256 id = lending.requestLoan(100e6, 1_000, 30 days);
        vm.prank(guarantor); lending.guarantee(id, 99e6);
        vm.prank(owner); lending.approveLoan(id, true);
        vm.prank(borrower); lending.activate(id);
        assertEq(usdc.balanceOf(borrower), 999e6);
        vm.warp(block.timestamp + 10 days);
        uint256 interest = lending.accruedInterest(id); usdc.mint(borrower, interest); vm.startPrank(borrower); usdc.approve(address(lending), 100e6 + interest); lending.repay(id, 100e6 + interest); vm.stopPrank();
        assertEq(vault.balanceOf(guarantor), 99_990_000); assertEq(vault.outstandingPrincipal(), 0); assertEq(usdc.balanceOf(address(insurance)), 2_020_000 + (interest * 900 / 10_000));
    }
}

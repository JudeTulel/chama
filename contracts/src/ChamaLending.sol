// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ChamaVault} from "./ChamaVault.sol";
import {MembershipRegistry} from "./MembershipRegistry.sol";
import {InsuranceFund} from "./InsuranceFund.sol";

/// @notice USDC loans secured by borrower/guarantor cUSDC shares.
contract ChamaLending is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    enum Status { Pending, Active, Repaid, Defaulted, Liquidated }
    struct Loan { address borrower; uint256 principal; uint256 outstanding; uint256 rateBps; uint256 createdAt; uint256 maturity; uint256 lockedShares; uint256 borrowerLockedShares; bool approved; Status status; }
    struct Guarantee { uint256 shares; uint256 interestClaim; }
    ChamaVault public immutable vault; IERC20 public immutable usdc; MembershipRegistry public immutable registry;
    uint256 public maxLoanMultiplierBps = 30_000; // 3x member shares
    uint256 public guarantorShareBps = 5_000; uint256 public poolShareBps = 3_800; uint256 public insuranceShareBps = 1_000;
    uint256 public constant INTEREST_INSURANCE_BPS = 200; // 2% of borrower interest
    uint256 public insuranceCoverageBps = 5_000;
    uint256 public constant DEFAULT_GRACE_PERIOD = 1 days;
    address public treasury; uint256 public nextLoanId;
    mapping(uint256 => Loan) public loans; mapping(uint256 => address[]) public guarantors; mapping(uint256 => mapping(address => Guarantee)) public guarantees;
    error NotMember(); error Invalid(); error Unauthorized(); error NotActive(); error InsufficientCollateral();
    event LoanRequested(uint256 indexed id, address indexed borrower, uint256 amount);
    event LoanApprovalUpdated(uint256 indexed id, bool approved);
    event Guaranteed(uint256 indexed id, address indexed guarantor, uint256 shares);
    event LoanActivated(uint256 indexed id); event Repaid(uint256 indexed id, uint256 principal, uint256 interest);
    event InterestClaimed(uint256 indexed id, address indexed guarantor, uint256 amount);
    event Liquidated(uint256 indexed id, uint256 insuredAmount, uint256 collateralLoss);

    constructor(address vault_, address registry_, address treasury_, address owner_) Ownable(owner_) {
        require(vault_ != address(0) && registry_ != address(0) && treasury_ != address(0), "zero address");
        vault = ChamaVault(vault_); usdc = vault.usdc(); registry = MembershipRegistry(registry_); treasury = treasury_;
    }
    modifier memberOnly() { if (!registry.isMember(msg.sender)) revert NotMember(); _; }
    function setParameters(uint256 multiplierBps, uint256 guarantorBps, uint256 poolBps, uint256 insuranceBps) external onlyOwner {
        if (multiplierBps < BPS || guarantorBps + poolBps + insuranceBps != BPS) revert Invalid();
        maxLoanMultiplierBps = multiplierBps; guarantorShareBps = guarantorBps; poolShareBps = poolBps; insuranceShareBps = insuranceBps;
    }
    function setInsuranceCoverage(uint256 coverageBps) external onlyOwner {
        if (coverageBps > BPS) revert Invalid();
        insuranceCoverageBps = coverageBps;
    }

    function approveLoan(uint256 id, bool approved) external onlyOwner {
        Loan storage loan = loans[id];
        if (loan.borrower == address(0) || loan.status != Status.Pending) revert Invalid();
        loan.approved = approved;
        emit LoanApprovalUpdated(id, approved);
    }

    function requestLoan(uint256 amount, uint256 rateBps, uint256 maturity) external memberOnly whenNotPaused returns (uint256 id) {
        if (amount == 0 || maturity <= block.timestamp || rateBps > 5_000) revert Invalid();
        uint256 capacity = vault.convertToAssets(vault.balanceOf(msg.sender)) * maxLoanMultiplierBps / BPS;
        if (amount > capacity) revert InsufficientCollateral();
        id = nextLoanId++; loans[id] = Loan(msg.sender, amount, amount, rateBps, block.timestamp, maturity, 0, 0, false, Status.Pending); emit LoanRequested(id, msg.sender, amount);
    }
    function guarantee(uint256 id, uint256 shares) external memberOnly nonReentrant whenNotPaused {
        Loan storage loan = loans[id]; if (loan.status != Status.Pending || shares == 0 || msg.sender == loan.borrower) revert Invalid();
        vault.lockShares(msg.sender, shares); if (guarantees[id][msg.sender].shares == 0) guarantors[id].push(msg.sender);
        guarantees[id][msg.sender].shares += shares; loan.lockedShares += shares; emit Guaranteed(id, msg.sender, shares);
    }
    function activate(uint256 id) external memberOnly nonReentrant whenNotPaused {
        Loan storage loan = loans[id]; if (loan.status != Status.Pending || !loan.approved || msg.sender != loan.borrower) revert Invalid();
        uint256 borrowerCollateral = vault.balanceOf(loan.borrower);
        if (borrowerCollateral > loan.principal) borrowerCollateral = loan.principal;
        if (loan.lockedShares + borrowerCollateral < loan.principal) revert InsufficientCollateral();
        if (borrowerCollateral > 0) { vault.lockShares(loan.borrower, borrowerCollateral); loan.borrowerLockedShares = borrowerCollateral; }
        loan.status = Status.Active; vault.increasePrincipal(loan.principal); vault.disburseLoan(loan.borrower, loan.principal); emit LoanActivated(id);
    }
    function accruedInterest(uint256 id) public view returns (uint256) { Loan memory l = loans[id]; uint256 elapsed = block.timestamp > l.maturity ? l.maturity - l.createdAt : block.timestamp - l.createdAt; return l.outstanding * l.rateBps * elapsed / BPS / YEAR; }
    function repay(uint256 id, uint256 amount) external nonReentrant whenNotPaused {
        Loan storage loan = loans[id]; if (loan.status != Status.Active || msg.sender != loan.borrower || amount == 0) revert NotActive();
        uint256 interest = accruedInterest(id); uint256 owed = loan.outstanding + interest; if (amount < owed) revert Invalid();
        usdc.safeTransferFrom(msg.sender, address(vault), amount); vault.decreasePrincipal(loan.outstanding); loan.outstanding = 0; loan.status = Status.Repaid;
        uint256 guarantorPool = interest * guarantorShareBps / BPS;
        uint256 treasuryFee = interest * insuranceShareBps / BPS;
        uint256 insuranceFee = interest * INTEREST_INSURANCE_BPS / BPS;
        if (treasuryFee > 0) vault.transferUSDC(treasury, treasuryFee);
        if (insuranceFee > 0) vault.transferUSDC(address(vault.insuranceFund()), insuranceFee);
        if (guarantorPool > 0) { for (uint256 i; i < guarantors[id].length; ++i) { address g = guarantors[id][i]; guarantees[id][g].interestClaim += guarantorPool * guarantees[id][g].shares / loan.lockedShares; } }
        for (uint256 i; i < guarantors[id].length; ++i) vault.unlockShares(guarantors[id][i], guarantees[id][guarantors[id][i]].shares);
        if (loan.borrowerLockedShares > 0) vault.unlockShares(loan.borrower, loan.borrowerLockedShares);
        emit Repaid(id, loan.principal, interest);
    }
    function liquidate(uint256 id) external nonReentrant {
        Loan storage loan = loans[id];
        if (loan.status != Status.Active || block.timestamp <= loan.maturity + DEFAULT_GRACE_PERIOD) revert Invalid();
        uint256 insuredTarget = loan.outstanding * insuranceCoverageBps / BPS;
        uint256 insured = InsuranceFund(address(vault.insuranceFund())).cover(id, address(vault), insuredTarget);
        if (insured > 0) vault.decreasePrincipal(insured);
        uint256 remaining = loan.outstanding - insured;
        uint256 collateralValue;
        uint256 totalLocked = loan.lockedShares + loan.borrowerLockedShares;
        if (totalLocked > 0) {
            collateralValue = vault.convertToAssets(totalLocked);
            if (collateralValue > remaining) collateralValue = remaining;
            vault.burnLockedShares(totalLocked);
            if (collateralValue > 0) vault.decreasePrincipal(collateralValue);
        }
        uint256 socializedLoss = remaining - collateralValue;
        if (socializedLoss > 0) vault.decreasePrincipal(socializedLoss);
        loan.status = Status.Liquidated;
        emit Liquidated(id, insured, collateralValue);
    }

    function claimGuaranteeInterest(uint256 id) external nonReentrant {
        uint256 amount = guarantees[id][msg.sender].interestClaim; if (amount == 0) revert Invalid(); guarantees[id][msg.sender].interestClaim = 0; vault.transferUSDC(msg.sender, amount); emit InterestClaimed(id, msg.sender, amount);
    }
}

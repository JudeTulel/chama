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
    struct Loan {
        address borrower;
        uint256 principal;
        uint256 outstanding;
        uint256 rateBps;
        uint256 createdAt;
        uint256 maturity;
        uint256 lockedShares;
        uint256 borrowerLockedShares;
        bool approved;
        Status status;
        string ipfsHash; // IPFS hash for loan reason
        uint256 voteEndsAt; // Timestamp when voting ends
    }

    // Separate mappings for voting data
    mapping(uint256 => mapping(address => bool)) public hasVoted; // Track who has voted on each loan
    mapping(uint256 => mapping(bool => uint256)) public votes; // Vote tally for each loan (true = approve, false = reject)
    uint256 public constant VOTING_PERIOD = 16 hours; // Voting period for loan approval
    struct Guarantee { uint256 shares; uint256 interestClaim; }
    ChamaVault public immutable vault; IERC20 public immutable usdc; MembershipRegistry public immutable registry;
    uint256 public maxLoanMultiplierBps = 30_000; // 3x member shares
    uint256 public guarantorShareBps = 5_000; uint256 public poolShareBps = 3_800; uint256 public insuranceShareBps = 300;
    uint256 public constant INTEREST_INSURANCE_BPS = 900; // 9% of borrower interest
    uint256 public insuranceCoverageBps = 5_000;
    uint256 public constant DEFAULT_GRACE_PERIOD = 1 days;
    uint256 public constant MAX_GUARANTORS = 32;
    address public treasury; uint256 public nextLoanId;
    mapping(uint256 => Loan) public loans; mapping(uint256 => address[]) public guarantors; mapping(uint256 => mapping(address => Guarantee)) public guarantees;
    error NotMember(); error Invalid(); error Unauthorized(); error NotActive(); error InsufficientCollateral();
    event LoanRequested(uint256 indexed id, address indexed borrower, uint256 amount);
    event LoanApprovalUpdated(uint256 indexed id, bool approved);
    event Guaranteed(uint256 indexed id, address indexed guarantor, uint256 shares);
    event LoanActivated(uint256 indexed id); event Repaid(uint256 indexed id, uint256 principal, uint256 interest);
    event InterestClaimed(uint256 indexed id, address indexed guarantor, uint256 amount);
    event Liquidated(uint256 indexed id, uint256 insuredAmount, uint256 collateralLoss);
    event ParametersUpdated(uint256 multiplierBps, uint256 guarantorBps, uint256 poolBps, uint256 insuranceBps);
    event InsuranceCoverageUpdated(uint256 coverageBps);
    event GuaranteeCancelled(uint256 indexed id, address indexed guarantor, uint256 shares);
    event OverpaymentRefunded(uint256 indexed id, address indexed borrower, uint256 assets);
    event LoanReasonSubmitted(uint256 indexed id, string ipfsHash);
    event VoteCast(uint256 indexed id, address indexed voter, bool approve, uint256 weight);
    event VotingEnded(uint256 indexed id, bool approved);

    constructor(address vault_, address registry_, address treasury_, address owner_) Ownable(owner_) {
        require(vault_ != address(0) && registry_ != address(0) && treasury_ != address(0), "zero address");
        vault = ChamaVault(vault_); usdc = vault.usdc(); registry = MembershipRegistry(registry_); treasury = treasury_;
    }
    modifier memberOnly() { if (!registry.isMember(msg.sender)) revert NotMember(); _; }
    /// @notice Pausing lending freezes new requests/guarantees/activations/repayments. Auto-lapses after 7 days.
    uint256 public constant MAX_PAUSE = 7 days;
    uint256 public pausedAt;
    function pause() external onlyOwner { pausedAt = block.timestamp; _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    function paused() public view override returns (bool) {
        return super.paused() && block.timestamp < pausedAt + MAX_PAUSE;
    }
    function setParameters(uint256 multiplierBps, uint256 guarantorBps, uint256 poolBps, uint256 insuranceBps) external onlyOwner {
        if (multiplierBps < BPS || guarantorBps + poolBps + insuranceBps + INTEREST_INSURANCE_BPS != BPS) revert Invalid();
        maxLoanMultiplierBps = multiplierBps; guarantorShareBps = guarantorBps; poolShareBps = poolBps; insuranceShareBps = insuranceBps;
        emit ParametersUpdated(multiplierBps, guarantorBps, poolBps, insuranceBps);
    }
    function setInsuranceCoverage(uint256 coverageBps) external onlyOwner {
        if (coverageBps > BPS) revert Invalid();
        insuranceCoverageBps = coverageBps;
        emit InsuranceCoverageUpdated(coverageBps);
    }

    function requestLoan(uint256 amount, uint256 rateBps, uint256 maturity, string calldata ipfsHash) external memberOnly whenNotPaused returns (uint256 id) {
        if (amount == 0 || maturity <= block.timestamp || rateBps > 5_000) revert Invalid();
        // Check IPFS hash length (max 300 characters)
        if (bytes(ipfsHash).length > 300) revert Invalid();
        uint256 capacity = vault.convertToAssets(vault.balanceOf(msg.sender)) * maxLoanMultiplierBps / BPS;
        if (amount > capacity) revert InsufficientCollateral();
        id = nextLoanId++;
        loans[id] = Loan(msg.sender, amount, amount, rateBps, block.timestamp, maturity, 0, 0, false, Status.Pending, ipfsHash, block.timestamp + VOTING_PERIOD);
        emit LoanRequested(id, msg.sender, amount);
        emit LoanReasonSubmitted(id, ipfsHash);
    }
    function guarantee(uint256 id, uint256 shares) external nonReentrant memberOnly whenNotPaused {
        Loan storage loan = loans[id];
        if (loan.status != Status.Pending || shares == 0 || msg.sender == loan.borrower) revert Invalid();
        // Check if voting period has ended and loan is not approved
        if (block.timestamp > loan.voteEndsAt && !loan.approved) revert Invalid();
        if (guarantees[id][msg.sender].shares == 0 && guarantors[id].length >= MAX_GUARANTORS) revert Invalid();
        if (guarantees[id][msg.sender].shares == 0) guarantors[id].push(msg.sender);
        guarantees[id][msg.sender].shares += shares; loan.lockedShares += shares; emit Guaranteed(id, msg.sender, shares);
        vault.lockShares(msg.sender, shares);
    }

    /// @notice Members vote on loan approval
    function voteOnLoan(uint256 id, bool approve) external memberOnly {
        Loan storage loan = loans[id];
        if (loan.status != Status.Pending) revert Invalid();
        if (hasVoted[id][msg.sender]) revert Invalid(); // Already voted
        if (block.timestamp > loan.voteEndsAt) revert Invalid(); // Voting period ended

        // Calculate vote weight based on member's share balance
        uint256 weight = vault.balanceOf(msg.sender);

        // Record vote
        hasVoted[id][msg.sender] = true;
        votes[id][approve] += weight;

        emit VoteCast(id, msg.sender, approve, weight);

        // Check if we have enough votes to decide early
        _checkVotingComplete(id);
    }

    /// @notice Check if voting is complete and update loan status
    function checkVotingComplete(uint256 id) external {
        Loan storage loan = loans[id];
        if (loan.status != Status.Pending) revert Invalid();
        if (block.timestamp <= loan.voteEndsAt) revert Invalid(); // Voting period not ended yet

        _checkVotingComplete(id);
    }

    function _checkVotingComplete(uint256 id) internal {
        Loan storage loan = loans[id];
        if (loan.status != Status.Pending) return; // Already processed

        // If voting period ended or we have enough votes to decide
        if (block.timestamp > loan.voteEndsAt) {
            // Tally votes - simple majority based on share weight
            uint256 approveVotes = votes[id][true];
            uint256 rejectVotes = votes[id][false];

            // Approve if more approve votes than reject votes
            bool approved = approveVotes > rejectVotes;
            loan.approved = approved;
            loan.voteEndsAt = 0; // Mark as processed

            emit VotingEnded(id, approved);
            emit LoanApprovalUpdated(id, approved);
        }
    }
    /// @notice Guarantor withdraws a guarantee while the loan is still Pending. Releases the locked shares.
    function cancelGuarantee(uint256 id) external nonReentrant {
        Loan storage loan = loans[id];
        if (loan.status != Status.Pending) revert Invalid();
        uint256 shares = guarantees[id][msg.sender].shares;
        if (shares == 0) revert Invalid();
        delete guarantees[id][msg.sender];
        loan.lockedShares -= shares;
        _removeGuarantor(id, msg.sender);
        emit GuaranteeCancelled(id, msg.sender, shares);
        vault.unlockShares(msg.sender, shares);
    }

    function _removeGuarantor(uint256 id, address guarantor_) internal {
        address[] storage list = guarantors[id];
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == guarantor_) { list[i] = list[list.length - 1]; list.pop(); return; }
        }
    }

    function activate(uint256 id) external nonReentrant memberOnly whenNotPaused {
        Loan storage loan = loans[id];
        if (loan.status != Status.Pending || !loan.approved || msg.sender != loan.borrower) revert Invalid();
        // Check that voting period has ended
        if (loan.voteEndsAt > 0 && block.timestamp <= loan.voteEndsAt) revert Invalid();
        // Borrower collateral is capped at the shares worth `principal`; all comparisons are done in USDC.
        uint256 borrowerCollateral = vault.balanceOf(loan.borrower);
        uint256 maxBorrowerShares = vault.convertToShares(loan.principal);
        if (borrowerCollateral > maxBorrowerShares) borrowerCollateral = maxBorrowerShares;
        if (vault.convertToAssets(loan.lockedShares + borrowerCollateral) < loan.principal) revert InsufficientCollateral();
        if (borrowerCollateral > 0) { loan.borrowerLockedShares = borrowerCollateral; }
        loan.status = Status.Active; vault.increasePrincipal(loan.principal); emit LoanActivated(id);
        if (borrowerCollateral > 0) vault.lockShares(loan.borrower, borrowerCollateral);
        vault.disburseLoan(loan.borrower, loan.principal);
    }
    function accruedInterest(uint256 id) public view returns (uint256) { Loan memory l = loans[id]; uint256 elapsed = block.timestamp > l.maturity ? l.maturity - l.createdAt : block.timestamp - l.createdAt; return l.outstanding * l.rateBps * elapsed / BPS / YEAR; }
    function repay(uint256 id, uint256 amount) external nonReentrant whenNotPaused {
        Loan storage loan = loans[id]; if (loan.status != Status.Active || msg.sender != loan.borrower || amount == 0) revert NotActive();
        uint256 interest = accruedInterest(id); uint256 owed = loan.outstanding + interest; if (amount < owed) revert Invalid();
        usdc.safeTransferFrom(msg.sender, address(vault), amount); vault.decreasePrincipal(loan.outstanding); loan.outstanding = 0; loan.status = Status.Repaid;
        _distributeInterest(id, interest);
        _releaseCollateral(id);
        if (amount > owed) {
            // Overpayment stays in the pool and is credited to the borrower as cUSDC at the post-repayment share price.
            vault.creditRefund(loan.borrower, amount - owed);
            emit OverpaymentRefunded(id, loan.borrower, amount - owed);
        }
    }
    function _distributeInterest(uint256 id, uint256 interest) internal {
        uint256 guarantorPool = interest * guarantorShareBps / BPS;
        uint256 treasuryFee = interest * insuranceShareBps / BPS;
        uint256 insuranceFee = interest * INTEREST_INSURANCE_BPS / BPS;
        if (guarantorPool > 0) { for (uint256 i; i < guarantors[id].length; ++i) { address g = guarantors[id][i]; guarantees[id][g].interestClaim += guarantorPool * guarantees[id][g].shares / loans[id].lockedShares; } }
        emit Repaid(id, loans[id].principal, interest);
        if (treasuryFee > 0) vault.transferUSDC(treasury, treasuryFee);
        if (insuranceFee > 0) vault.transferUSDC(address(vault.insuranceFund()), insuranceFee);
    }
    function _releaseCollateral(uint256 id) internal {
        address[] storage list = guarantors[id];
        for (uint256 i; i < list.length; ++i) vault.unlockShares(list[i], guarantees[id][list[i]].shares);
        if (loans[id].borrowerLockedShares > 0) vault.unlockShares(loans[id].borrower, loans[id].borrowerLockedShares);
    }
    function liquidate(uint256 id) external nonReentrant {
        Loan storage loan = loans[id];
        if (loan.status != Status.Active || block.timestamp <= loan.maturity + DEFAULT_GRACE_PERIOD) revert Invalid();
        uint256 insuredTarget = loan.outstanding * insuranceCoverageBps / BPS;
        uint256 insured = InsuranceFund(address(vault.insuranceFund())).cover(id, address(vault), insuredTarget);
        if (insured > 0) vault.decreasePrincipal(insured);
        uint256 remaining = loan.outstanding - insured;
        uint256 collateralValue = 0;
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
        uint256 amount = guarantees[id][msg.sender].interestClaim; if (amount == 0) revert Invalid(); guarantees[id][msg.sender].interestClaim = 0; emit InterestClaimed(id, msg.sender, amount); vault.transferUSDC(msg.sender, amount);
    }
}

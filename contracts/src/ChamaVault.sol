// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MembershipRegistry} from "./MembershipRegistry.sol";
import {InsuranceFund} from "./InsuranceFund.sol";

/// @notice Single-asset USDC savings pool and ERC-20 cooperative share token.
/// @dev USDC uses 6 decimals on Arc. Shares use 6 decimals for easy accounting.
contract ChamaVault is ERC20, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    IERC20 public immutable usdc;
    MembershipRegistry public immutable registry;
    address public lendingModule;
    InsuranceFund public immutable insuranceFund;
    uint256 public constant DEPOSIT_INSURANCE_FEE_BPS = 100;
    uint256 public outstandingPrincipal;

    /// @notice Delay before a changed lending module takes effect. Depositors can exit during this window.
    uint256 public constant MODULE_TIMELOCK = 2 days;
    /// @notice A pause expires on its own after this long, so the owner cannot freeze withdrawals indefinitely.
    uint256 public constant MAX_PAUSE = 7 days;
    address public pendingLendingModule;
    uint256 public pendingModuleEta;
    uint256 public pausedAt;

    error NotMember(); error Unauthorized(); error InvalidAmount(); error InsufficientLiquidity();
    error NotReady(); error NoPendingModule();
    event Deposited(address indexed member, uint256 assets, uint256 shares);
    event Withdrawn(address indexed member, uint256 assets, uint256 shares);
    event LendingModuleSet(address indexed module);
    event LendingModuleProposed(address indexed module, uint256 eta);
    event LendingModuleCancelled(address indexed module);
    event RefundCredited(address indexed to, uint256 assets, uint256 shares);
    event PrincipalUpdated(uint256 outstandingPrincipal);

    modifier memberOnly() { if (!registry.isMember(msg.sender)) revert NotMember(); _; }
    modifier onlyLending() { if (msg.sender != lendingModule) revert Unauthorized(); _; }

    constructor(address usdc_, address registry_, address insuranceFund_, address owner_)
        ERC20("Chama USD Coin Shares", "cUSDC") Ownable(owner_) {
        require(usdc_ != address(0) && registry_ != address(0) && insuranceFund_ != address(0), "zero address");
        usdc = IERC20(usdc_); registry = MembershipRegistry(registry_); insuranceFund = InsuranceFund(insuranceFund_);
    }

    function decimals() public pure override returns (uint8) { return 6; }
    function totalAssets() public view returns (uint256) { return usdc.balanceOf(address(this)) + outstandingPrincipal; }
    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply(); uint256 assetsTotal = totalAssets();
        return supply == 0 || assetsTotal == 0 ? assets : assets * supply / assetsTotal;
    }
    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply(); return supply == 0 ? 0 : shares * totalAssets() / supply;
    }
    /// @notice First call wires the module immediately (factory setup). Any later change is timelocked:
    /// call proposeLendingModule, wait MODULE_TIMELOCK, then executeLendingModule.
    function setLendingModule(address module) external onlyOwner {
        require(module != address(0), "zero module");
        if (lendingModule == address(0)) {
            lendingModule = module;
            emit LendingModuleSet(module);
        } else {
            _propose(module);
        }
    }
    function proposeLendingModule(address module) external onlyOwner {
        require(module != address(0) && lendingModule != address(0), "zero module");
        _propose(module);
    }
    function _propose(address module) internal {
        pendingLendingModule = module;
        pendingModuleEta = block.timestamp + MODULE_TIMELOCK;
        emit LendingModuleProposed(module, pendingModuleEta);
    }
    function executeLendingModule() external onlyOwner {
        if (pendingModuleEta == 0) revert NoPendingModule();
        if (block.timestamp < pendingModuleEta) revert NotReady();
        lendingModule = pendingLendingModule;
        delete pendingLendingModule; delete pendingModuleEta;
        emit LendingModuleSet(lendingModule);
    }
    function cancelLendingModule() external onlyOwner {
        if (pendingModuleEta == 0) revert NoPendingModule();
        emit LendingModuleCancelled(pendingLendingModule);
        delete pendingLendingModule; delete pendingModuleEta;
    }

    function pause() external onlyOwner { pausedAt = block.timestamp; _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    /// @dev Pause lapses after MAX_PAUSE even if the owner never unpauses.
    function paused() public view override returns (bool) {
        return super.paused() && block.timestamp < pausedAt + MAX_PAUSE;
    }

    /// @notice Credits an overpayment to a borrower as cUSDC. The USDC is already in the vault balance,
    /// so shares are priced against the assets that existed before the refund (no dilution of other members).
    function creditRefund(address to, uint256 assets) external onlyLending {
        uint256 supply = totalSupply();
        uint256 baseAssets = totalAssets() - assets;
        uint256 shares = supply == 0 || baseAssets == 0 ? assets : assets * supply / baseAssets;
        _mint(to, shares);
        emit RefundCredited(to, assets, shares);
    }

    function deposit(uint256 assets) external nonReentrant whenNotPaused memberOnly returns (uint256 shares) {
        if (assets == 0) revert InvalidAmount();
        uint256 fee = assets * DEPOSIT_INSURANCE_FEE_BPS / 10_000;
        uint256 netAssets = assets - fee; shares = convertToShares(netAssets);
        _mint(msg.sender, shares);
        emit Deposited(msg.sender, assets, shares);
        usdc.safeTransferFrom(msg.sender, address(this), assets);
        if (fee > 0) { usdc.safeTransfer(address(insuranceFund), fee); insuranceFund.recordDepositFee(fee); }
    }
    function withdraw(uint256 assets) external nonReentrant whenNotPaused memberOnly returns (uint256 shares) {
        if (assets == 0 || assets > usdc.balanceOf(address(this))) revert InsufficientLiquidity();
        shares = (assets * totalSupply() + totalAssets() - 1) / totalAssets();
        if (shares > balanceOf(msg.sender)) revert InsufficientLiquidity();
        _burn(msg.sender, shares);
        emit Withdrawn(msg.sender, assets, shares);
        usdc.safeTransfer(msg.sender, assets);
    }
    function lockShares(address from, uint256 shares) external onlyLending { _transfer(from, lendingModule, shares); }
    function unlockShares(address to, uint256 shares) external onlyLending { _transfer(lendingModule, to, shares); }
    function burnLockedShares(uint256 shares) external onlyLending { _burn(lendingModule, shares); }
    function disburseLoan(address to, uint256 amount) external onlyLending {
        if (amount > usdc.balanceOf(address(this))) revert InsufficientLiquidity();
        usdc.safeTransfer(to, amount);
    }
    function transferUSDC(address to, uint256 amount) external onlyLending {
        if (amount > usdc.balanceOf(address(this))) revert InsufficientLiquidity();
        usdc.safeTransfer(to, amount);
    }
    function increasePrincipal(uint256 amount) external onlyLending { outstandingPrincipal += amount; emit PrincipalUpdated(outstandingPrincipal); }
    function decreasePrincipal(uint256 amount) external onlyLending { require(amount <= outstandingPrincipal, "principal"); outstandingPrincipal -= amount; emit PrincipalUpdated(outstandingPrincipal); }
}

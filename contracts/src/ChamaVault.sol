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

    error NotMember(); error Unauthorized(); error InvalidAmount(); error InsufficientLiquidity();
    event Deposited(address indexed member, uint256 assets, uint256 shares);
    event Withdrawn(address indexed member, uint256 assets, uint256 shares);
    event LendingModuleSet(address indexed module);
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
    function setLendingModule(address module) external onlyOwner {
        require(module != address(0), "zero module");
        lendingModule = module;
        emit LendingModuleSet(module);
    }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

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

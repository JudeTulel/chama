// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice USDC reserve funded by a fee on every vault deposit.
contract InsuranceFund is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable usdc;
    address public vault;
    address public lendingModule;

    event LendingModuleSet(address indexed module);
    event VaultSet(address indexed vault);
    event DepositFeeReceived(address indexed from, uint256 amount);
    event DefaultCovered(uint256 indexed loanId, uint256 amount);

    modifier onlyLending() {
        require(msg.sender == lendingModule, "not lending");
        _;
    }

    constructor(address usdc_, address owner_) Ownable(owner_) {
        require(usdc_ != address(0), "zero usdc");
        usdc = IERC20(usdc_);
    }

    function setVault(address vault_) external onlyOwner {
        require(vault == address(0) && vault_ != address(0), "vault set");
        vault = vault_;
        emit VaultSet(vault_);
    }

    function setLendingModule(address module) external onlyOwner {
        require(module != address(0), "zero module");
        lendingModule = module;
        emit LendingModuleSet(module);
    }

    function recordDepositFee(uint256 amount) external {
        require(msg.sender == vault, "not vault");
        emit DepositFeeReceived(msg.sender, amount);
    }

    function cover(uint256 loanId, address recipient, uint256 amount) external nonReentrant onlyLending returns (uint256 paid) {
        paid = amount > usdc.balanceOf(address(this)) ? usdc.balanceOf(address(this)) : amount;
        emit DefaultCovered(loanId, paid);
        if (paid > 0) usdc.safeTransfer(recipient, paid);
    }
}

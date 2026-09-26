// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MembershipRegistry} from "./MembershipRegistry.sol";
import {InsuranceFund} from "./InsuranceFund.sol";
import {ChamaVault} from "./ChamaVault.sol";
import {ChamaLending} from "./ChamaLending.sol";
import {ChamaDirectory} from "./ChamaDirectory.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Deploys and wires one isolated USDC chama per call.
/// @dev The caller becomes owner of every contract in the created chama.
contract ChamaFactory is ReentrancyGuard {
    struct Chama {
        address owner;
        address usdc;
        address treasury;
        address registry;
        address insuranceFund;
        address vault;
        address lending;
    }

    uint256 public nextChamaId;
    mapping(uint256 => Chama) public chamas;
    address public immutable directory;

    event ChamaCreated(uint256 indexed id, address indexed owner, address registry, address insuranceFund, address vault, address lending);

    constructor() {
        ChamaDirectory createdDirectory = new ChamaDirectory(address(this), msg.sender);
        directory = address(createdDirectory);
    }

    function createChama(address usdc, address treasury) external nonReentrant returns (uint256 id, Chama memory chama) {
        require(usdc != address(0) && treasury != address(0), "zero address");
        MembershipRegistry registry = new MembershipRegistry(address(this));
        InsuranceFund insurance = new InsuranceFund(usdc, address(this));
        ChamaVault vault = new ChamaVault(usdc, address(registry), address(insurance), address(this));
        insurance.setVault(address(vault));
        ChamaLending lending = new ChamaLending(address(vault), address(registry), treasury, address(this));
        vault.setLendingModule(address(lending));
        insurance.setLendingModule(address(lending));

        registry.setMembershipManager(directory);
        uint256 directoryChamaId = ChamaDirectory(directory).registerChama(msg.sender, usdc, address(registry), address(insurance), address(vault), address(lending), "Chama", "");
        registry.transferOwnership(msg.sender);
        insurance.transferOwnership(msg.sender);
        vault.transferOwnership(msg.sender);
        lending.transferOwnership(msg.sender);

        id = nextChamaId++;
        require(directoryChamaId == id, "directory id mismatch");
        chama = Chama(msg.sender, usdc, treasury, address(registry), address(insurance), address(vault), address(lending));
        chamas[id] = chama;
        emit ChamaCreated(id, msg.sender, address(registry), address(insurance), address(vault), address(lending));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ChamaDirectory} from "./ChamaDirectory.sol";
import {MembershipRegistry} from "./MembershipRegistry.sol";
import {InsuranceFund} from "./InsuranceFund.sol";
import {ChamaVault} from "./ChamaVault.sol";
import {ChamaLending} from "./ChamaLending.sol";

interface IPoolDeployer {
    function deployPool(
        address factory,
        address usdc
    ) external returns (address registry, address insuranceFund, address vault);
}

interface ILendingDeployer {
    function deployLending(
        address factory,
        address vault,
        address registry,
        address treasury
    ) external returns (address lending);
}

interface IWirer {
    function wireAndRegister(
        address registry,
        address insuranceFund,
        address vault,
        address lending,
        address directory,
        address newOwner,
        address usdc,
        uint256 factoryId,
        string memory name
    ) external;
}

/// @dev Deploys the pool-side contracts (registry, insurance, vault).
/// Called via delegatecall from the factory; `address(this)` is the factory contract.
contract ChamaPoolDeployer {
    function deployPool(
        address factory,
        address usdc
    ) external returns (address registry, address insuranceFund, address vault) {
        registry = address(new MembershipRegistry(factory));
        insuranceFund = address(new InsuranceFund(usdc, factory));
        vault = address(new ChamaVault(usdc, registry, insuranceFund, factory));
        InsuranceFund(insuranceFund).setVault(vault);
    }
}

/// @dev Deploys and wires the lending contract.
/// Called via delegatecall from the factory; `address(this)` is the factory contract.
contract ChamaLendingDeployer {
    function deployLending(
        address factory,
        address vault,
        address registry,
        address treasury
    ) external returns (address lending) {
        lending = address(new ChamaLending(vault, registry, treasury, factory));
        ChamaVault(vault).setLendingModule(lending);
        InsuranceFund(ChamaVault(vault).insuranceFund()).setLendingModule(lending);
    }
}

/// @dev Registers the fully-wired chama in the directory and transfers ownership of
/// all child contracts to the new owner.
/// Called via delegatecall from the factory; `address(this)` is the factory contract.
contract ChamaWirer {
    error DirectoryIdMismatch(uint256 factoryId, uint256 directoryId);

    function wireAndRegister(
        address registry,
        address insuranceFund,
        address vault,
        address lending,
        address directory,
        address newOwner,
        address usdc,
        uint256 factoryId,
        string memory name
    ) external {
        MembershipRegistry(registry).setMembershipManager(directory);
        uint256 directoryChamaId = ChamaDirectory(directory).registerChama(newOwner, usdc, registry, insuranceFund, vault, lending, name, "");
        if (directoryChamaId != factoryId) revert DirectoryIdMismatch(factoryId, directoryChamaId);

        MembershipRegistry(registry).transferOwnership(newOwner);
        InsuranceFund(insuranceFund).transferOwnership(newOwner);
        ChamaVault(vault).transferOwnership(newOwner);
        ChamaLending(lending).transferOwnership(newOwner);
    }
}

/// @notice Deploys and wires one isolated USDC chama per call.
/// @dev The caller becomes owner of every contract in the created chama.
/// Directory creation and registry storage are inline (small); child-contract creation
/// is delegated to separate deployer contracts via delegatecall so this factory stays
/// under the EIP-170 size limit. Using delegatecall means `address(this)` inside the
/// deployer functions is this factory, so children are created with the factory as owner.
contract ChamaFactory {
    error InvalidChamaName();
    error ZeroAddress();
    error DelegatecallFailed();
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
    address public immutable poolDeployer;
    address public immutable lendingDeployer;
    address public immutable wirer;

    event ChamaCreated(uint256 indexed id, address indexed owner, address registry, address insuranceFund, address vault, address lending);

    constructor(address poolDeployer_, address lendingDeployer_, address wirer_) {
        require(poolDeployer_ != address(0) && lendingDeployer_ != address(0) && wirer_ != address(0), "zero deployer");
        poolDeployer = poolDeployer_;
        lendingDeployer = lendingDeployer_;
        wirer = wirer_;
        directory = address(new ChamaDirectory(address(this), msg.sender));
    }

    function _delegate(address target, bytes memory data) internal returns (bytes memory) {
        (bool success, bytes memory result) = target.delegatecall(data);
        if (!success) revert DelegatecallFailed();
        return result;
    }

    function createChama(address usdc, address treasury, string calldata name) external returns (uint256 id) {
        if (bytes(name).length == 0 || bytes(name).length > 64) revert InvalidChamaName();
        if (usdc == address(0) || treasury == address(0)) revert ZeroAddress();
        id = nextChamaId++;

        (address registry, address insuranceFund, address vault) = abi.decode(
            _delegate(poolDeployer, abi.encodeWithSelector(IPoolDeployer.deployPool.selector, address(this), usdc)),
            (address, address, address)
        );
        address lending = abi.decode(
            _delegate(lendingDeployer, abi.encodeWithSelector(ILendingDeployer.deployLending.selector, address(this), vault, registry, treasury)),
            (address)
        );
        _delegate(wirer, abi.encodeWithSelector(
            IWirer.wireAndRegister.selector,
            registry, insuranceFund, vault, lending, directory, msg.sender, usdc, id, name
        ));

        chamas[id] = Chama(msg.sender, usdc, treasury, registry, insuranceFund, vault, lending);
        emit ChamaCreated(id, msg.sender, registry, insuranceFund, vault, lending);
    }
}

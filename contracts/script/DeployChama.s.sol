// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ChamaFactory, ChamaPoolDeployer, ChamaLendingDeployer, ChamaWirer} from "../src/ChamaFactory.sol";

contract DeployChama is Script {
    function run() external returns (ChamaFactory factory) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address treasury = vm.envAddress("TREASURY");
        vm.startBroadcast(deployerKey);
        ChamaPoolDeployer poolDeployer = new ChamaPoolDeployer();
        ChamaLendingDeployer lendingDeployer = new ChamaLendingDeployer();
        ChamaWirer wirer = new ChamaWirer();
        factory = new ChamaFactory(address(poolDeployer), address(lendingDeployer), address(wirer));
        factory.createChama(usdc, treasury, vm.envOr("CHAMA_NAME", string("Default Chama")));
        vm.stopBroadcast();
    }
}

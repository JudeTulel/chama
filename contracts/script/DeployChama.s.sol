// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ChamaFactory} from "../src/ChamaFactory.sol";

contract DeployChama is Script {
    function run() external returns (ChamaFactory factory) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address treasury = vm.envAddress("TREASURY");
        vm.startBroadcast(deployerKey);
        factory = new ChamaFactory();
        factory.createChama(usdc, treasury, vm.envOr("CHAMA_NAME", string("Default Chama")));
        vm.stopBroadcast();
    }
}

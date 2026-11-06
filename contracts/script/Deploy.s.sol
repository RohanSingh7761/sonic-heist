// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

import "../src/HeistVault.sol";

contract DeployScript {
    Vm constant vm = Vm(address(bytes20(uint160(uint256(keccak256("hevm cheat code"))))));

    function run() external returns (HeistVault heist) {
        vm.startBroadcast();

        heist = new HeistVault();
        heist.setGameActive(true);

        vm.stopBroadcast();
    }
}

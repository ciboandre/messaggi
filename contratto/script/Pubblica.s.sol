// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Script, console} from "forge-std/Script.sol";
import {Manto} from "../src/Manto.sol";

/// Pubblica il contratto. La chiave di chi pubblica la passa forge (--private-key,
/// --account o --ledger); dopo la pubblicazione non ha alcun potere.
///
///   forge script script/Pubblica.s.sol --rpc-url $RPC --broadcast --account <nome>
contract Pubblica is Script {
    function run() external returns (Manto manto) {
        vm.startBroadcast();
        manto = new Manto();
        vm.stopBroadcast();
        console.log("Manto pubblicato a", address(manto));
    }
}

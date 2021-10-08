// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.0;

/// This contract stores all new local variables for the MinterAmm.sol contract.
/// This allows us to upgrade the contract and add new variables without worrying about
///   memory layout when we add new variables.
/// Each time a new version is created with new variables, the version "V1, V2, etc" should
//    be bumped and inherit from the previous version, and the MinterAmm should inherit from
///   the newest version.
contract MinterAmmStorageV1 {
    /// @dev The address for the airswap Light contract on-chain.
    address public lightAirswapAddress;
}

// Next version example:
/// contract MinterAmmStorageV2 is MinterAmmStorageV1 {
///   address public myAddress;
/// }
/// Then... MinterAmm should inherit from MinterAmmStorageV2

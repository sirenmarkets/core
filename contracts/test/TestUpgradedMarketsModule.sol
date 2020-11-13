pragma solidity 0.6.12;

import "../market/MarketsRegistry.sol";

/**
 * An inheriting markets module to test with that it can be upgraded
 */
contract TestUpgradeMarketsRegistry is MarketsRegistry {
    // Add a function that returns upgraded = true
    function isUpgraded() public pure returns (bool) {
        return true;
    }
}

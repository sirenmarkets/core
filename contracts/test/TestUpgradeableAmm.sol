pragma solidity 0.6.12;

import "../amm/MinterAmm.sol";

/**
 * An inheriting AMM to test with that it can be upgraded
 */
contract TestUpgradeableAmm is MinterAmm {
    // Add a function that returns upgraded = true
    function isUpgraded() public pure returns (bool) {
        return true;
    }
}

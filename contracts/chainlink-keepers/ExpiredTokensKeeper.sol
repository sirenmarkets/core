// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./KeeperCompatibleInterface.sol";
import "../amm/IMinterAmm.sol";

contract ExpiredTokensKeeper is KeeperCompatibleInterface {
    uint256 public lastTimeStamp = 0;
    address[] amms;

    constructor(address[] memory _amms) {
        for (uint256 i = 0; i < _amms.length; i++) {
            amms.push(_amms[i]);
        }
    }

    function getAmms() public view returns (address[] memory) {
        return amms;
    }

    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        upkeepNeeded = (block.timestamp - lastTimeStamp) >= 1 weeks;
        // We don't use the checkData.
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        // We don't check if conditions are satisfied, because
        // we require execution at least once per week.
        for (uint256 i = 0; i < amms.length; i++) {
            IMinterAmm(amms[i]).claimAllExpiredTokens();
        }
        // We need to update timestamp
        lastTimeStamp = block.timestamp;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./KeeperCompatibleInterface.sol";
import "../series/IVolatilityOracle.sol";
import "../configuration/IAddressesProvider.sol";
import "../series/IPriceOracle.sol";

contract VolatilityOracleKeeper is KeeperCompatibleInterface {
    IAddressesProvider public immutable addressesProvider;

    constructor(IAddressesProvider _addressesProvider) {
        addressesProvider = _addressesProvider;
    }

    // We will not make it as view
    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        IPriceOracle pOracle = IPriceOracle(addressesProvider.getPriceOracle());
        IVolatilityOracle vOracle = IVolatilityOracle(
            addressesProvider.getVolatilityOracle()
        );
        uint256 feedCount = pOracle.getPriceFeedsCount();
        for (uint256 i = 0; i < feedCount; i++) {
            IPriceOracle.PriceFeed memory feed = pOracle.getPriceFeed(i);
            try vOracle.commit(feed.underlyingToken, feed.priceToken) {
                upkeepNeeded = true;
                break;
            } catch {}
        }
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        IPriceOracle pOracle = IPriceOracle(addressesProvider.getPriceOracle());
        IVolatilityOracle vOracle = IVolatilityOracle(
            addressesProvider.getVolatilityOracle()
        );
        uint256 feedCount = pOracle.getPriceFeedsCount();
        for (uint256 i = 0; i < feedCount; i++) {
            IPriceOracle.PriceFeed memory feed = pOracle.getPriceFeed(i);
            try
                vOracle.commit(feed.underlyingToken, feed.priceToken)
            {} catch {}
        }
    }
}

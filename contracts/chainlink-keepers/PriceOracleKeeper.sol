// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./KeeperCompatibleInterface.sol";
import "../series/IPriceOracle.sol";
import "../configuration/IAddressesProvider.sol";

contract PriceOracleKeeper is KeeperCompatibleInterface {
    IAddressesProvider public immutable addressesProvider;

    constructor(IAddressesProvider _addressesProvider) {
        addressesProvider = _addressesProvider;
    }

    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        override
        returns (
            bool upkeepNeeded,
            bytes memory /*performData*/
        )
    {
        IPriceOracle oracle = IPriceOracle(addressesProvider.getPriceOracle());
        uint256 settlementTimestamp = oracle.get8amWeeklyOrDailyAligned(
            block.timestamp
        );
        uint256 feedCount = oracle.getPriceFeedsCount();

        for (uint256 i = 0; i < feedCount; i++) {
            IPriceOracle.PriceFeed memory feed = oracle.getPriceFeed(i);
            (bool isSet, ) = oracle.getSettlementPrice(
                feed.underlyingToken,
                feed.priceToken,
                settlementTimestamp
            );

            if (!isSet) {
                upkeepNeeded = true;
                break; // exit early
            }
        }
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        IPriceOracle oracle = IPriceOracle(addressesProvider.getPriceOracle());
        uint256 settlementTimestamp = oracle.get8amWeeklyOrDailyAligned(
            block.timestamp
        );
        uint256 feedCount = oracle.getPriceFeedsCount();

        for (uint256 i = 0; i < feedCount; i++) {
            IPriceOracle.PriceFeed memory feed = oracle.getPriceFeed(i);
            (bool isSet, ) = oracle.getSettlementPrice(
                feed.underlyingToken,
                feed.priceToken,
                settlementTimestamp
            );

            if (!isSet) {
                try
                    oracle.setSettlementPrice(
                        feed.underlyingToken,
                        feed.priceToken
                    )
                {} catch {}
            }
        }
    }
}

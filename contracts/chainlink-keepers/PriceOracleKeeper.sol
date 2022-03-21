// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./KeeperCompatibleInterface.sol";
import "../series/IPriceOracle.sol";
import "../configuration/IAddressesProvider.sol";
import "../amm/AmmFactory.sol";
import "../amm/IMinterAmm.sol";

contract PriceOracleKeeper is KeeperCompatibleInterface {
    IAddressesProvider public immutable addressesProvider;

    constructor(IAddressesProvider _addressesProvider) {
        addressesProvider = _addressesProvider;
    }

    function getAmmCallPutAddr(address underlyingToken, address priceToken)
        public
        view
        returns (address, address)
    {
        AmmFactory ammFactory = AmmFactory(addressesProvider.getAmmFactory());
        address callAmm = ammFactory.amms(
            keccak256(abi.encode(underlyingToken, priceToken, underlyingToken))
        );
        address putAmm = ammFactory.amms(
            keccak256(abi.encode(underlyingToken, priceToken, priceToken))
        );
        return (callAmm, putAmm);
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
            // Before we call any setSettlementPrice, we first claim all series
            (address callAmm, address putAmm) = getAmmCallPutAddr(
                feed.underlyingToken,
                feed.priceToken
            );
            if (callAmm != address(0)) {
                IMinterAmm(callAmm).claimAllExpiredTokens();
            }
            if (putAmm != address(0)) {
                IMinterAmm(putAmm).claimAllExpiredTokens();
            }
            (bool isSet, ) = oracle.getSettlementPrice(
                feed.underlyingToken,
                feed.priceToken,
                settlementTimestamp
            );

            if (!isSet) {
                oracle.setSettlementPrice(
                    feed.underlyingToken,
                    feed.priceToken
                );
            }
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./KeeperCompatibleInterface.sol";
import "../series/IPriceOracle.sol";
import "../configuration/IAddressesProvider.sol";
import "../amm/IAmmFactory.sol";
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
        IAmmFactory ammFactory = IAmmFactory(addressesProvider.getAmmFactory());
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
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /*performData*/
        )
    {
        IPriceOracle oracle = IPriceOracle(addressesProvider.getPriceOracle());
        ISeriesController seriesController = ISeriesController(
            addressesProvider.getSeriesController()
        );
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
            // Check AllClaim
            (address callAmm, address putAmm) = getAmmCallPutAddr(
                feed.underlyingToken,
                feed.priceToken
            );
            // callAmm expired check
            if (callAmm != address(0)) {
                uint64[] memory allSeriesCall = IMinterAmm(callAmm)
                    .getAllSeries();
                for (uint256 i = 0; i < allSeriesCall.length; i++) {
                    uint64 seriesId = uint64(allSeriesCall[i]);
                    if (
                        seriesController.state(seriesId) ==
                        ISeriesController.SeriesState.EXPIRED
                    ) {
                        upkeepNeeded = true;
                        break; // exit early
                    }
                }
            }
            // putAmm expired check
            if (putAmm != address(0)) {
                uint64[] memory allSeriesPut = IMinterAmm(putAmm)
                    .getAllSeries();
                for (uint256 i = 0; i < allSeriesPut.length; i++) {
                    uint64 seriesId = uint64(allSeriesPut[i]);
                    if (
                        seriesController.state(seriesId) ==
                        ISeriesController.SeriesState.EXPIRED
                    ) {
                        upkeepNeeded = true;
                        break; // exit early
                    }
                }
            }
        }
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        bool completedWork = false;
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
                try IMinterAmm(callAmm).claimAllExpiredTokens() {
                    completedWork = true;
                } catch {}
            }
            if (putAmm != address(0)) {
                try IMinterAmm(putAmm).claimAllExpiredTokens() {
                    completedWork = true;
                } catch {}
            }
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
                {
                    completedWork = true;
                } catch {}
            }
        }
        require(completedWork, "!work");
    }
}

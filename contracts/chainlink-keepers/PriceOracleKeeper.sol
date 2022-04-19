// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./KeeperCompatibleInterface.sol";
import "../series/IPriceOracle.sol";
import "../configuration/IAddressesProvider.sol";
import "../amm/IAmmFactory.sol";
import "../amm/IMinterAmm.sol";

contract PriceOracleKeeper is KeeperCompatibleInterface {
    IAddressesProvider public immutable addressesProvider;
    event FailedSettlementPrice(
        address underlyingToken,
        address priceToken,
        uint256 settlementTimestamp
    );
    event FailedToClaim(address amm, bool isPut);

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

    function isClaimRequiredAmm(address amm)
        public
        view
        returns (bool claimRequired)
    {
        ISeriesController seriesController = ISeriesController(
            addressesProvider.getSeriesController()
        );
        claimRequired = false;
        if (amm != address(0)) {
            uint64[] memory allSeriesCall = IMinterAmm(amm).getAllSeries();
            for (uint256 i = 0; i < allSeriesCall.length; i++) {
                uint64 seriesId = uint64(allSeriesCall[i]);
                if (
                    seriesController.state(seriesId) ==
                    ISeriesController.SeriesState.EXPIRED
                ) {
                    claimRequired = true;
                    break; // exit early
                }
            }
        }
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
            if (isClaimRequiredAmm(callAmm)) {
                upkeepNeeded = true;
            }
            if (isClaimRequiredAmm(putAmm)) {
                upkeepNeeded = true;
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
            // We call claim, only if something can be claimed otherwise claim will be successful without
            // doing anything and we set completedWork = true
            if (isClaimRequiredAmm(callAmm)) {
                try IMinterAmm(callAmm).claimAllExpiredTokens() {
                    completedWork = true;
                } catch {
                    emit FailedToClaim(callAmm, false);
                }
            }
            if (isClaimRequiredAmm(putAmm)) {
                try IMinterAmm(putAmm).claimAllExpiredTokens() {
                    completedWork = true;
                } catch {
                    emit FailedToClaim(putAmm, true);
                }
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
                } catch {
                    emit FailedSettlementPrice(
                        feed.underlyingToken,
                        feed.priceToken,
                        settlementTimestamp
                    );
                }
            }
        }
        require(completedWork, "!work");
    }
}

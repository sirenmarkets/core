// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.0;

interface IPriceOracle {
    struct PriceFeed {
        address underlyingToken;
        address priceToken;
        address oracle;
    }

    function getSettlementPrice(
        address underlyingToken,
        address priceToken,
        uint256 settlementDate
    ) external view returns (bool, uint256);

    function getCurrentPrice(address underlyingToken, address priceToken)
        external
        view
        returns (uint256);

    function setSettlementPrice(address underlyingToken, address priceToken)
        external;

    function setSettlementPriceForDate(
        address underlyingToken,
        address priceToken,
        uint256 date,
        uint80 roundId
    ) external;

    function get8amWeeklyOrDailyAligned(uint256 _timestamp)
        external
        view
        returns (uint256);

    function addTokenPair(
        address underlyingToken,
        address priceToken,
        address oracle
    ) external;

    function updateOracleAddress(
        address underlyingToken,
        address priceToken,
        address newOracle,
        uint256 feedId
    ) external;

    function getPriceFeed(uint256 feedId)
        external
        view
        returns (IPriceOracle.PriceFeed memory);

    function getPriceFeedsCount() external view returns (uint256);
}

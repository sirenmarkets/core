// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.0;

import "../series/PriceOracle";

//Add chainlinkname at begining

/**
 * The MockPriceOracle exists to ease testing the AMM's interaction with the onchain price feed oracle.
 * During tests, this contract should be deployed and passed to the AMM .initialize method, and for each
 * test the .setLatestAnswer method may be used to change the price returned by the MockPriceOracle to
 * the AMM.
 */
contract MockVolatilityPriceOracle is PriceOracle {
    constructor() public PriceOracle(0) {}

    /// @notice Stores the current price from the oracle specified by the pair underlyingToken-priceToken for the
    /// given settlement date
    /// @param underlyingToken Should be equal to the Markets' underlyingToken field
    /// @param priceToken Should be equal to the Markets' priceToken field
    /// @dev This function exists only to prevent scenarios where the while loop in PriceOracle.setSettlementPrice
    /// consumes too much gas and fails with an Out Of Gas error. Since this function only sets a single date, it
    /// is in no danger of running out of gas
    /// @param date A date aligned to 8am UTC and offset by dateOffset which the settlement price should be set on
    /// @dev This function call will fail if the date is not aligned to 8am UTC, and will be a no-op if a
    /// price at the given date has already been set
    function setSettlementPriceOnDate(
        address underlyingToken,
        address priceToken,
        uint256 date,
        uint256 price
    ) external override {
        require(
            oracles[underlyingToken][priceToken] != address(0x0),
            "no oracle address for this token pair"
        );

        // the given date must be aligned to 8am UTC and the correct offset, otherwise we will end up
        // setting a price on a un-aligned date
        require(
            date == get8amWeeklyOrDailyAligned(date),
            "date is not aligned"
        );

        // the settlement date must be in the past, otherwise any address will be able to set future settlement prices,
        // which we cannot allow
        require(date < block.timestamp, "date must be in the past");

        // we do not want to overwrite a settlement date that has already had its price set, so we end execution
        // early if we find that to be true
        if (settlementPrices[underlyingToken][priceToken][date] != 0) {
            return;
        }

        // fetch the current spot price for this pair's oracle, and set it as the price for the given date
        uint256 spotPrice = getCurrentPrice(underlyingToken, priceToken);
        settlementPrices[underlyingToken][priceToken][date] = price;

        emit SettlementPriceSet(underlyingToken, priceToken, date, spotPrice);
    }
}

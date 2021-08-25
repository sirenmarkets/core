// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

/**
 * The MockPriceOracle exists to ease testing the AMM's interaction with the onchain price feed oracle.
 * During tests, this contract should be deployed and passed to the AMM .initialize method, and for each
 * test the .setLatestAnswer method may be used to change the price returned by the MockPriceOracle to
 * the AMM.
 */
contract MockPriceOracle is AggregatorV3Interface {
    int256 public latestAnswer;

    uint8 internal priceDecimals;

    constructor(uint8 _priceDecimals) public {
        priceDecimals = _priceDecimals;
    }

    function setLatestAnswer(int256 _latestAnswer) public {
        latestAnswer = _latestAnswer;
    }

    function decimals() public view override returns (uint8) {
        return priceDecimals;
    }

    // just put something here, it's not used during tests
    function description() public view override returns (string memory) {
        return "BTC/USD";
    }

    // just put something here, it's not used during tests
    function version() public view override returns (uint256) {
        return 3;
    }

    // This function is never used for testing, so just use arbitrary return values. Only
    // latestRoundData gets used for testing
    function getRoundData(uint80 _roundId)
        public
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, 42, 0, 1, _roundId);
    }

    function latestRoundData()
        public
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1337, latestAnswer, 0, 1, 1337); // 1337 is an arbitrary value, it does not matter for testing
    }
}

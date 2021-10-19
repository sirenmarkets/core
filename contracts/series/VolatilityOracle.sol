// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "./IPriceOracle.sol";
import "../libraries/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../libraries/Welford.sol";
import {PRBMathSD59x18} from "../libraries/PRBMathSD59x18.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";

contract VolatilityOracle is Ownable {
    using SafeMath for uint256;

    IPriceOracle public priceOracleAddress;
    uint32 public immutable period = 1 days;
    uint256 public immutable annualizationConstant =
        Math.sqrt(uint256(31536000).div(uint256(86400)));

    uint256 constant WAD = 10**18;

    /**
     * Storage
     */
    struct Accumulator {
        // Max number of records: 2^16-1 = 65535.
        // If we commit twice a day, we get to have a max of ~89 years.
        uint16 count;
        // Timestamp of the last record
        uint32 lastTimestamp;
        // Smaller size because prices denominated in USDC, max 7.9e27
        int96 mean;
        // Stores the sum of squared errors
        uint112 m2;
    }

    /***
     * Events
     */
    event Commit(
        uint16 count,
        uint32 commitTimestamp,
        int96 mean,
        uint112 m2,
        uint256 newValue,
        address committer
    );

    /// @dev Stores the latest data that helps us compute the standard deviation of the seen dataset.
    mapping(address => mapping(address => Accumulator)) internal volatility;

    uint256 observationCount;

    constructor(uint256 _observationCount, IPriceOracle _priceOracle) {
        observationCount = _observationCount;
        priceOracleAddress = _priceOracle;
    }

    function updateSampleVariance(address underlyingToken, address priceToken)
        external
    {
        if (
            block.timestamp -
                volatility[underlyingToken][priceToken].lastTimestamp <
            24 hours
        ) return;
        (uint32 commitTimestamp, uint32 gapFromPeriod) = secondsFromPeriod();

        uint256 lastSettlementDate = IPriceOracle(priceOracleAddress)
            .get8amWeeklyOrDailyAligned(block.timestamp - 1 days);

        (, uint256 lastPrice) = IPriceOracle(priceOracleAddress)
            .getSettlementPrice(
                underlyingToken,
                priceToken,
                lastSettlementDate
            );

        uint256 price = IPriceOracle(priceOracleAddress).getCurrentPrice(
            underlyingToken,
            priceToken
        );

        uint256 _lastPrice = lastPrice;
        uint256 periodReturn = _lastPrice > 0
            ? (((price * WAD) + (_lastPrice / 2)) / _lastPrice)
            : 0;

        // logReturn is in 10**18
        // we need to scale it down to 10**8
        int256 logReturn = periodReturn > 0
            ? PRBMathSD59x18.ln(int256(periodReturn)) / 10**10
            : 0;
        Accumulator storage accum = volatility[underlyingToken][priceToken];

        (uint256 newCount, int256 newMean, uint256 newM2) = Welford.update(
            accum.count,
            accum.mean,
            accum.m2,
            logReturn
        );

        require(newCount < type(uint16).max, ">U16");
        require(newMean < type(int96).max, ">I96");
        require(newM2 < type(uint112).max, ">U112");

        accum.count = uint16(newCount);
        accum.mean = int96(newMean);
        accum.m2 = uint112(newM2);
        accum.lastTimestamp = commitTimestamp;

        emit Commit(
            uint16(newCount),
            uint32(commitTimestamp),
            int96(newMean),
            uint112(newM2),
            price,
            msg.sender
        );
    }

    // function updateVolatilityBatch(address[] underlyingTokens, address priceToken) {
    //     for each (underlyingToken) {
    //         updateVolatility(underlyingToken, priceToken);
    //     }
    // }

    /**
     * @notice Returns the standard deviation of the base currency in 10**8 i.e. 1*10**8 = 100%
     * @return standardDeviation is the standard deviation of the asset
     */
    // function getVolatility(address underlyingToken, address priceToken) external returns(currentSampleVariance memory currentVolatility){
    //     return Welford.stdev( volatility[underlyingToken][priceToken].count, volatility[underlyingToken][priceToken].m2);
    // }

    /**
     * @notice Returns the annualized standard deviation of the base currency in 10**8 i.e. 1*10**8 = 100%
     * @return annualStdev is the annualized standard deviation of the asset
     */
    function annualizedVol(address underlyingToken, address priceToken)
        public
        view
        returns (uint256 annualStdev)
    {
        annualStdev =
            Welford.stdev(
                volatility[underlyingToken][priceToken].count,
                volatility[underlyingToken][priceToken].m2
            ) *
            annualizationConstant;
        return annualStdev;
    }

    // Admin functions
    function setSampleVariance(
        address underlyingToken,
        address priceToken,
        uint16 count,
        uint32 lastTimestamp,
        int96 mean
    ) public onlyOwner {
        //Add Require Checks in here
        volatility[underlyingToken][priceToken].count = count;
        volatility[underlyingToken][priceToken].lastTimestamp = lastTimestamp;
        volatility[underlyingToken][priceToken].mean = mean;
    }

    function addTokenPairAndSetSampleVariance(
        address underlyingToken,
        address priceToken,
        address oracle,
        uint16 count,
        uint32 lastTimestamp,
        int96 mean
    ) external onlyOwner {
        IPriceOracle(priceOracleAddress).addTokenPair(
            underlyingToken,
            priceToken,
            oracle
        );
        setSampleVariance(
            underlyingToken,
            priceToken,
            count,
            lastTimestamp,
            mean
        );
    }

    /**
     * @notice Returns the closest period from the current block.timestamp
     * @return closestPeriod is the closest period timestamp
     * @return gapFromPeriod is the gap between now and the closest period: abs(periodTimestamp - block.timestamp)
     */
    function secondsFromPeriod()
        internal
        view
        returns (uint32 closestPeriod, uint32 gapFromPeriod)
    {
        uint32 timestamp = uint32(block.timestamp);
        uint32 rem = timestamp % period;
        if (rem < period / 2) {
            return (timestamp - rem, rem);
        }
        return (timestamp + period - rem, period - rem);
    }
}

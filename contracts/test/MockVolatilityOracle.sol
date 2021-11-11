//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.0;

import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {Welford} from "../libraries/Welford.sol";
import {DSMath} from "../libraries/DSMath.sol";
import {VolatilityOracle} from "../series/VolatilityOracle.sol";
import {Math} from "../libraries/Math.sol";
import {PRBMathSD59x18} from "../libraries/PRBMathSD59x18.sol";
import "../series/IPriceOracle.sol";
import "hardhat/console.sol";

contract MockVolatilityOracle is DSMath, VolatilityOracle {
    using SafeMath for uint256;
    uint256 private _price;

    constructor(
        uint32 _period,
        IPriceOracle _priceOracle,
        uint256 _windowInDays
    ) VolatilityOracle(_period, _priceOracle, _windowInDays) {}

    function mockCommit(address underlyingToken, address priceToken) external {
        require(
            observations[underlyingToken][priceToken].length > 0,
            "!pool initialize"
        );

        (uint32 commitTimestamp, uint32 gapFromPeriod) = secondsFromPeriod();

        // require(gapFromPeriod < commitPhaseDuration, "Not commit phase");

        uint256 price = IPriceOracle(priceOracleAddress).getCurrentPrice(
            underlyingToken,
            priceToken
        );
        uint256 _lastPrice = lastPrices[underlyingToken][priceToken];
        uint256 periodReturn = _lastPrice > 0 ? wdiv(price, _lastPrice) : 0;

        // logReturn is in 10**18
        // we need to scale it down to 10**8
        int256 logReturn = periodReturn > 0
            ? PRBMathSD59x18.ln(int256(periodReturn)) / 10**10
            : 0;

        Accumulator storage accum = accumulators[underlyingToken][priceToken];

        // require(
        //     block.timestamp >=
        //         accum.lastTimestamp + period - commitPhaseDuration,
        //     "Committed"
        // );

        uint256 currentObservationIndex = accum.currentObservationIndex;

        (int256 newMean, int256 newDSQ) = Welford.update(
            observationCount(underlyingToken, priceToken, true),
            observations[underlyingToken][priceToken][currentObservationIndex],
            logReturn,
            accum.mean,
            int256(accum.dsq)
        );

        require(newMean < type(int96).max, ">I96");
        // require(newDSQ < type(uint120).max, ">U120");

        accum.mean = int96(newMean);
        accum.dsq = uint256(newDSQ);
        accum.lastTimestamp = commitTimestamp;
        observations[underlyingToken][priceToken][
            currentObservationIndex
        ] = logReturn;
        accum.currentObservationIndex = uint8(
            (currentObservationIndex + 1) % windowSize
        );
        lastPrices[underlyingToken][priceToken] = price;

        emit Commit(
            uint32(commitTimestamp),
            int96(newMean),
            uint256(newDSQ),
            price,
            msg.sender
        );
    }

    function setPrice(uint256 price) public {
        _price = price;
    }

    /**
     * @notice create token pair for testing so include data not just the token pair
     */
    function addTokenPairAndLastPrice(
        address underlyingToken,
        address priceToken,
        uint256 lastPrice,
        uint32 lastTimestamp,
        int96 mean,
        uint256 dsq,
        int256 logReturn
    ) external {
        require(
            observations[underlyingToken][priceToken].length < 1,
            "Pool initialized"
        );
        observations[underlyingToken][priceToken][0] = logReturn;
        lastPrices[underlyingToken][priceToken] = lastPrice;
        accumulators[underlyingToken][priceToken].currentObservationIndex = 0;
        accumulators[underlyingToken][priceToken].lastTimestamp = lastTimestamp;
        accumulators[underlyingToken][priceToken].mean = mean;
        accumulators[underlyingToken][priceToken].dsq = dsq;
    }
}

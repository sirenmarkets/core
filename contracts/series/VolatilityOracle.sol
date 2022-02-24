//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.0;

import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {DSMath} from "../libraries/DSMath.sol";
import {Welford} from "../libraries/Welford.sol";
import "../proxy/Proxiable.sol";
import "../proxy/Proxy.sol";
import {Math} from "../libraries/Math.sol";
import {PRBMathSD59x18} from "../libraries/PRBMathSD59x18.sol";
import "./IPriceOracle.sol";
import "../configuration/IAddressesProvider.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract VolatilityOracle is DSMath, OwnableUpgradeable, Proxiable {
    using SafeMath for uint256;

    IAddressesProvider public addressesProvider;

    /**
     * Immutables
     */
    uint32 public period;
    uint256 public windowSize;
    uint256 public annualizationConstant;
    uint256 internal constant commitPhaseDuration = 29400; // 8 hours and 10 mins from every period

    /**
     * Storage
     */
    struct Accumulator {
        // Stores the index of next observation
        uint8 currentObservationIndex;
        // Timestamp of the last record
        uint32 lastTimestamp;
        // Smaller size because prices denominated in USDC, max 7.9e27
        int96 mean;
        // Stores the dsquared (variance * count)
        uint256 dsq;
    }

    /// @dev Stores the latest data that helps us compute the standard deviation of the seen dataset.
    mapping(address => mapping(address => Accumulator)) public accumulators;

    /// @dev Stores the last oracle TWAP price for a pool
    mapping(address => mapping(address => uint256)) public lastPrices;

    // @dev Stores log-return observations over window
    mapping(address => mapping(address => int256[])) public observations;

    /***
     * Events
     */

    event AccumulatorSet(
        address underlyingToken,
        address priceToken,
        uint8 currentObservationIndex,
        uint32 lastTimestamp,
        int96 mean,
        uint256 dsq
    );

    event TokenPairAdded(address underlyingToken, address priceToken);

    event LastPriceSet(
        address underlyingToken,
        address priceToken,
        uint256 price
    );

    event Commit(
        uint32 commitTimestamp,
        int96 mean,
        uint256 dsq,
        uint256 newValue,
        address committer
    );

    /**
     * @notice Creates an volatility oracle for a pool
     * @param _period is how often the oracle needs to be updated
     * @param _addressesProvider the addressesProvider address
     * @param _windowInDays is how many days the window should be
     */
    function initialize(
        uint32 _period,
        IAddressesProvider _addressesProvider,
        uint256 _windowInDays
    ) external initializer {
        require(_period > 0, "!_period");
        require(_windowInDays > 0, "!_windowInDays");

        period = _period;
        addressesProvider = _addressesProvider;
        windowSize = _windowInDays.mul(uint256(1 days).div(_period));

        // 31536000 seconds in a year
        // divided by the period duration
        // For e.g. if period = 1 day = 86400 seconds
        // It would be 31536000/86400 = 365 days.
        annualizationConstant = Math.sqrt(uint256(31536000).div(_period));

        __Ownable_init();
    }

    /// @notice update the logic contract for this proxy contract
    /// @param _newImplementation the address of the new MinterAmm implementation
    /// @dev only the admin address may call this function
    function updateImplementation(address _newImplementation)
        external
        onlyOwner
    {
        require(_newImplementation != address(0x0), "E1");

        _updateCodeAddress(_newImplementation);
    }

    /**
     * @notice Initialized pool observation window
     */
    function addTokenPair(address underlyingToken, address priceToken)
        external
        onlyOwner
    {
        require(
            observations[underlyingToken][priceToken].length == 0,
            "Pool initialized"
        );
        observations[underlyingToken][priceToken] = new int256[](windowSize);

        emit TokenPairAdded(underlyingToken, priceToken);
    }

    /**
     * @notice Commits an oracle update. Must be called after pool initialized
     */
    function commit(address underlyingToken, address priceToken) external {
        require(
            observations[underlyingToken][priceToken].length > 0,
            "!pool initialize"
        );

        (uint32 commitTimestamp, uint32 gapFromPeriod) = secondsFromPeriod();
        require(gapFromPeriod < commitPhaseDuration, "Not commit phase");

        uint256 price = IPriceOracle(addressesProvider.getPriceOracle())
            .getCurrentPrice(underlyingToken, priceToken);
        uint256 _lastPrice = lastPrices[underlyingToken][priceToken];
        uint256 periodReturn = _lastPrice > 0 ? wdiv(price, _lastPrice) : 0;

        require(price > 0, "Price from price oracle is 0");

        // logReturn is in 10**18
        // we need to scale it down to 10**8
        int256 logReturn = periodReturn > 0
            ? PRBMathSD59x18.ln(int256(periodReturn)) / 10**10
            : 0;

        Accumulator storage accum = accumulators[underlyingToken][priceToken];

        require(block.timestamp >= accum.lastTimestamp + period, "Committed");

        uint256 currentObservationIndex = accum.currentObservationIndex;

        (int256 newMean, int256 newDSQ) = Welford.update(
            observationCount(underlyingToken, priceToken, true),
            observations[underlyingToken][priceToken][currentObservationIndex],
            logReturn,
            accum.mean,
            int256(accum.dsq)
        );

        require(newMean < type(int96).max, ">I96");
        require(uint256(newDSQ) < type(uint256).max, ">U120");

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

    /**
     * @notice Returns the standard deviation of the base currency in 10**8 i.e. 1*10**8 = 100%
     * @return standardDeviation is the standard deviation of the asset
     */
    function vol(address underlyingToken, address priceToken)
        public
        view
        returns (uint256 standardDeviation)
    {
        return
            Welford.stdev(
                observationCount(underlyingToken, priceToken, false),
                int256(accumulators[underlyingToken][priceToken].dsq)
            );
    }

    /**
     * @notice Returns the annualized standard deviation of the base currency in 10**8 i.e. 1*10**8 = 100%
     * @return annualStdev is the annualized standard deviation of the asset
     */
    function annualizedVol(address underlyingToken, address priceToken)
        public
        view
        virtual
        returns (uint256 annualStdev)
    {
        return
            Welford
                .stdev(
                    observationCount(underlyingToken, priceToken, false),
                    int256(accumulators[underlyingToken][priceToken].dsq)
                )
                .mul(annualizationConstant);
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

    /**
     * @notice Returns the current number of observations [0, windowSize]
     * @param isInc is whether we want to add 1 to the number of
     * observations for mean purposes
     * @return obvCount is the observation count
     */
    function observationCount(
        address underlyingToken,
        address priceToken,
        bool isInc
    ) internal view returns (uint256 obvCount) {
        uint256 size = windowSize; // cache for gas
        obvCount = observations[underlyingToken][priceToken][size - 1] != 0
            ? size
            : accumulators[underlyingToken][priceToken]
                .currentObservationIndex + (isInc ? 1 : 0);
    }

    /**
     * Sets the Accumulator for a token pair
     * @param underlyingToken Should be equal to the Series' underlyingToken field
     * @param priceToken Should be equal to the Series' priceToken field
     * @param currentObservationIndex Stores the index of next observation
     * @param lastTimestamp Timestamp of the last record
     * @param mean Smaller size because prices denominated in USDC, max 7.9e27
     * @param dsq Stores the dsquared (variance * count)
     */
    function setAccumulator(
        address underlyingToken,
        address priceToken,
        uint8 currentObservationIndex,
        uint32 lastTimestamp,
        int96 mean,
        uint256 dsq
    ) external onlyOwner {
        Accumulator memory newAccumulator = Accumulator({
            currentObservationIndex: currentObservationIndex,
            lastTimestamp: lastTimestamp,
            mean: mean,
            dsq: dsq
        });
        accumulators[underlyingToken][priceToken] = newAccumulator;

        emit AccumulatorSet(
            underlyingToken,
            priceToken,
            currentObservationIndex,
            lastTimestamp,
            mean,
            dsq
        );
    }

    function setLastPrice(
        address underlyingToken,
        address priceToken,
        uint256 price
    ) external onlyOwner {
        lastPrices[underlyingToken][priceToken] = price;

        emit LastPriceSet(underlyingToken, priceToken, price);
    }
}

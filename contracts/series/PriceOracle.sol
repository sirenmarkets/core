// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "./IPriceOracle.sol";
import "../proxy/Proxiable.sol";

/// @title PriceOracle
/// @notice Uses a collection of sub price oracles to fetch settlement price and current price data for the SeriesController
/// @notice The price data is for a given underlying-price token pair and Series expiration date
/// @dev An important assumption of the PriceOracle is that settlement dates are aligned to 8am UTC, and separated either by
/// 1 day or 1 week. The value of the dateOffset state variable determines whether the interval between settlement dates
/// is 1 day or 1 week. We do this because we do not want to fragment liquidity and complicate the UX by
/// allowing for arbitrary settlement dates, so we enforce a specific interval between all Series' settlement dates
/// @dev All prices are normalized to 8 decimal places
contract PriceOracle is IPriceOracle, OwnableUpgradeable, Proxiable {
    /// @dev Stores the price for a given <underlyingToken>-<priceToken>-<settlementDate> triplet
    /// @dev All prices are normalized to 8 decimals
    mapping(address => mapping(address => mapping(uint256 => uint256)))
        internal settlementPrices;

    /// @dev Stores the oracle address to use when looking for the price of a given token
    /// @dev oracles are keyed by the pair of underlyingToken-priceToken, so for a BTCUSD oracle
    /// returning a price of $14_000, the pair would be the addresses corresponding to WBTC and USDC
    mapping(address => mapping(address => address)) internal oracles;

    /// @dev the time length in seconds between successive settlement dates. Must
    /// be either 1 day or 1 week
    uint256 internal dateOffset;

    /// @dev array of all price feeds
    IPriceOracle.PriceFeed[] internal priceFeeds;

    event SettlementPriceSet(
        address underlyingToken,
        address priceToken,
        uint256 settlementDate,
        uint256 price
    );

    event OracleSet(
        address underlyingToken,
        address priceToken,
        address oracle,
        uint256 earliestSettlementDate
    );

    /// @notice Setup the owner and date time and range for this PriceOracle
    /// @param _dateOffset the time length in seconds between successive settlement dates. MUST
    /// be either 1 day or 1 week. On mainnet networks we always use 1 week, but for testnets in order
    /// to have faster testing iterations we reduce the interval to 1 day
    function initialize(uint256 _dateOffset) external initializer {
        require(
            _dateOffset == 1 days || _dateOffset == 1 weeks,
            "PriceOracle: _dateOffset must align to 1 day or 1 week"
        );

        __Ownable_init();
        dateOffset = _dateOffset;
    }

    /// @notice Stores the price from the oracle specified by the pair underlyingToken-priceToken
    /// @param underlyingToken Should be equal to the Series' underlyingToken field
    /// @param priceToken Should be equal to the Series' priceToken field
    function setSettlementPrice(address underlyingToken, address priceToken)
        external
        override
    {
        AggregatorV3Interface aggregator = AggregatorV3Interface(
            oracles[underlyingToken][priceToken]
        );

        require(
            address(aggregator) != address(0x0),
            "no oracle address for this token pair"
        );

        // settlement dates that have not yet had their price set to that spot price
        uint256 priorAligned8am = get8amWeeklyOrDailyAligned(block.timestamp);
        uint256 currentSettlementPrice = settlementPrices[underlyingToken][
            priceToken
        ][priorAligned8am];

        if (currentSettlementPrice == 0) {
            (uint80 lastRoundId, , , , ) = aggregator.latestRoundData();

            // Find first round after the settlement date
            (
                uint80 targetRoundId,
                uint256 targetPrice
            ) = findFirstRoundAfterDate(
                    underlyingToken,
                    priceToken,
                    priorAligned8am,
                    lastRoundId
                );

            require(targetPrice > 0, "!targetPrice");

            settlementPrices[underlyingToken][priceToken][
                priorAligned8am
            ] = targetPrice;

            emit SettlementPriceSet(
                underlyingToken,
                priceToken,
                priorAligned8am,
                targetPrice
            );
        }
    }

    /// @dev find earliest round after given timestamp searching backwards starting from `startWithRound`
    function findFirstRoundAfterDate(
        address underlyingToken,
        address priceToken,
        uint256 timestamp,
        uint80 startWithRound
    ) internal view returns (uint80 targetRoundId, uint256 targetPrice) {
        AggregatorV3Interface aggregator = AggregatorV3Interface(
            oracles[underlyingToken][priceToken]
        );

        (uint80 roundId, int256 answer, , uint256 roundTimestamp, ) = aggregator
            .getRoundData(startWithRound);
        uint80 targetRoundId;

        while (roundTimestamp >= timestamp) {
            if (answer > 0) {
                targetRoundId = roundId;
                targetPrice = uint256(answer);
            }

            if (roundId == 0) break;
            roundId -= 1;
            (, answer, , roundTimestamp, ) = aggregator.getRoundData(roundId);

            // handle incomplete round
            if (roundTimestamp == 0) {
                // set in order for the loop to continue
                roundTimestamp = timestamp;
            }
        }

        return (targetRoundId, targetPrice);
    }

    /// @notice get the settlement price with the given underlyingToken and priceToken,
    /// at the given expirationDate, and whether the price exists
    /// @param underlyingToken Should be equal to the Series' underlyingToken field
    /// @param priceToken Should be equal to the Series' priceToken field
    /// @param settlementDate Should be equal to the expirationDate of the Series we're getting the settlement price for
    /// @return true if the settlement price has been set (i.e. is nonzero), false otherwise
    /// @return the settlement price
    function getSettlementPrice(
        address underlyingToken,
        address priceToken,
        uint256 settlementDate
    ) external view override returns (bool, uint256) {
        require(
            oracles[underlyingToken][priceToken] != address(0x0),
            "no oracle address for this token pair"
        );

        uint256 settlementPrice = settlementPrices[underlyingToken][priceToken][
            settlementDate
        ];

        return (settlementPrice != 0, settlementPrice);
    }

    /// @notice Stores the price from the oracle specified by the pair underlyingToken-priceToken for the
    /// given settlement date and roundId
    /// @param underlyingToken Should be equal to the Markets' underlyingToken field
    /// @param priceToken Should be equal to the Markets' priceToken field
    /// @dev This function exists only to prevent scenarios where the while loop in PriceOracle.findFirstRoundAfterDate
    /// consumes too much gas and fails with an Out Of Gas error. Since this function only sets a single date, it
    /// is in no danger of running out of gas
    /// @param date A date aligned to 8am UTC and offset by dateOffset which the settlement price should be set on
    /// @dev This function call will fail if the date is not aligned to 8am UTC, and will be a no-op if a
    /// price at the given date has already been set
    function setSettlementPriceForDate(
        address underlyingToken,
        address priceToken,
        uint256 date,
        uint80 roundId
    ) external override {
        AggregatorV3Interface aggregator = AggregatorV3Interface(
            oracles[underlyingToken][priceToken]
        );

        require(
            address(aggregator) != address(0x0),
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
        require(date <= block.timestamp, "date must be in the past");

        // we do not want to overwrite a settlement date that has already had its price set, so we end execution
        // early if we find that to be true
        if (settlementPrices[underlyingToken][priceToken][date] != 0) {
            return;
        }

        // we check that provided roundId is the earliest round after the settlement date
        (, int256 price, , uint256 roundTimestamp, ) = aggregator.getRoundData(
            roundId
        );

        require(date <= roundTimestamp, "!roundId");
        require(price >= 0, "!price");

        bool isCorrectRoundId;
        uint80 previousRoundId = roundId - 1;

        while (!isCorrectRoundId) {
            (, , , uint256 previousRoundTimestamp, ) = aggregator.getRoundData(
                previousRoundId
            );

            if (previousRoundTimestamp == 0) {
                require(previousRoundId > 0, "!previousRoundId");
                previousRoundId = previousRoundId - 1;
            } else if (previousRoundTimestamp > date) {
                revert("!first");
            } else {
                isCorrectRoundId = true;
            }
        }

        settlementPrices[underlyingToken][priceToken][date] = uint256(price);

        emit SettlementPriceSet(
            underlyingToken,
            priceToken,
            date,
            uint256(price)
        );
    }

    /// @notice Use an oracle keyed by the underlyingToken-priceToken pair to fetch the current price
    /// @param underlyingToken Should be equal to the Series' underlyingToken field
    /// @param priceToken Should be equal to the Series' priceToken field
    function getCurrentPrice(address underlyingToken, address priceToken)
        public
        view
        override
        returns (uint256)
    {
        require(
            oracles[underlyingToken][priceToken] != address(0x0),
            "no oracle address for this token pair"
        );

        (, int256 latestAnswer, , , ) = AggregatorV3Interface(
            oracles[underlyingToken][priceToken]
        ).latestRoundData();
        require(latestAnswer >= 0, "invalid value received from price oracle");

        return uint256(latestAnswer);
    }

    /// @notice Sets the price oracle to use for the given underlyingToken and priceToken pair
    /// @param underlyingToken Should be equal to the Series' underlyingToken field
    /// @param priceToken Should be equal to the Series' priceToken field
    /// @param oracle The address of the price oracle contract
    function addTokenPair(
        address underlyingToken,
        address priceToken,
        address oracle
    ) external override onlyOwner {
        require(
            oracles[underlyingToken][priceToken] == address(0x0),
            "PriceOracle: cannot set address for an existing oracle"
        );

        // set the pair's oracle on the PriceOracle
        oracles[underlyingToken][priceToken] = oracle;

        // add to list of price feeds
        priceFeeds.push(
            IPriceOracle.PriceFeed(underlyingToken, priceToken, oracle)
        );

        // Get the price and ensure it is valid
        uint256 currentPrice = getCurrentPrice(underlyingToken, priceToken);
        require(
            currentPrice > 0,
            "price oracle must start with a valid price feed"
        );

        // We need to initially set the price on some offset-aligned date prior to the current date, so that
        // in the loop in PriceOracle.setSettlementDate it will eventually stop looping when it finds a
        // non-zero price. If we do not add set this price, then the first call to PriceOracle.setSettlementDate the first
        // is guaranteed to run out of gas because there will never be a non-zero price value. We choose the most recent
        // aligned date because it will result in the least gas used by PriceOracle.setSettlementDate
        uint256 earliestSettlementDate = get8amWeeklyOrDailyAligned(
            block.timestamp
        );
        settlementPrices[underlyingToken][priceToken][
            earliestSettlementDate
        ] = currentPrice;

        emit OracleSet(
            underlyingToken,
            priceToken,
            oracle,
            earliestSettlementDate
        );
    }

    /// @notice update the PriceOracle's logic contract
    /// @param newPriceOracleImpl the address of the new price oracle implementation contract
    function updateImplementation(address newPriceOracleImpl)
        external
        onlyOwner
    {
        require(
            newPriceOracleImpl != address(0x0),
            "PriceOracle: Invalid newPriceOracleImpl"
        );

        // Call the proxiable update
        _updateCodeAddress(newPriceOracleImpl);
    }

    /// @notice Returns the given timestamp date, but aligned to the prior 8am UTC dateOffset in the past
    /// unless the timestamp is exactly 8am UTC, in which case it will return the same
    /// value as the timestamp. If PriceOracle.dateOffset is 1 day then this function
    /// will align on every day at 8am, and if its 1 week it will align on every Friday 8am UTC
    /// @param _timestamp a block time (seconds past epoch)
    /// @return the block time of the prior (or current) 8am UTC date, dateOffset in the past
    function get8amWeeklyOrDailyAligned(uint256 _timestamp)
        public
        view
        override
        returns (uint256)
    {
        uint256 numOffsetsSinceEpochStart = _timestamp / dateOffset;

        // this will get us the timestamp of the Thursday midnight date prior to _timestamp if
        // dateOffset equals 1 week, or it will get us the timestamp of midnight of the previous
        // day if dateOffset equals 1 day. We rely on Solidity's integral rounding in the line above
        uint256 timestampRoundedDown = numOffsetsSinceEpochStart * dateOffset;

        if (dateOffset == 1 days) {
            uint256 eightHoursAligned = timestampRoundedDown + 8 hours;
            if (eightHoursAligned > _timestamp) {
                return eightHoursAligned - 1 days;
            } else {
                return eightHoursAligned;
            }
        } else {
            uint256 fridayEightHoursAligned = timestampRoundedDown +
                (1 days + 8 hours);
            if (fridayEightHoursAligned > _timestamp) {
                return fridayEightHoursAligned - 1 weeks;
            } else {
                return fridayEightHoursAligned;
            }
        }
    }

    function getPriceFeed(uint256 feedId)
        external
        view
        override
        returns (IPriceOracle.PriceFeed memory)
    {
        return priceFeeds[feedId];
    }

    function getPriceFeedsCount() public view override returns (uint256) {
        return priceFeeds.length;
    }
}

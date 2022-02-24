pragma solidity 0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../proxy/Proxiable.sol";
import "./IMinterAmm.sol";
import "../series/ISeriesController.sol";
import "../series/SeriesLibrary.sol";
import "../series/IPriceOracle.sol";
import "../series/IVolatilityOracle.sol";
import "../configuration/IAddressesProvider.sol";
import "./IAmmDataProvider.sol";
import "./IWTokenVault.sol";

contract WTokenVault is OwnableUpgradeable, Proxiable, IWTokenVault {
    /// @dev The address for the AddressesProvider
    IAddressesProvider addressesProvider;

    /// locked wTokens by seriesId
    mapping(address => mapping(uint64 => uint256)) public lockedWTokens;

    /// total supply of pool shares by expiration date
    mapping(address => mapping(uint256 => uint256)) public lpSharesSupply;

    /// balance of shares for each LP in expiration pool
    mapping(address => mapping(uint256 => mapping(address => uint256)))
        public lpShares;

    /// locked collateral by expiration date
    mapping(address => mapping(uint256 => uint256)) public lockedCollateral;

    /// redeemed collateral by LP
    mapping(address => mapping(uint256 => mapping(address => uint256)))
        public redeemedCollateral;

    function initialize(IAddressesProvider _addressesProvider)
        external
        initializer
    {
        addressesProvider = _addressesProvider;
        __Ownable_init();
    }

    /// @notice update the logic contract for this proxy contract
    /// @param _newImplementation the address of the new WTokenVault implementation
    /// @dev only the admin address may call this function
    function updateImplementation(address _newImplementation)
        external
        onlyOwner
    {
        require(_newImplementation != address(0x0), "!implementation");

        _updateCodeAddress(_newImplementation);
    }

    function getWTokenBalance(address poolAddress, uint64 seriesId)
        external
        view
        override
        returns (uint256)
    {
        return lockedWTokens[poolAddress][seriesId];
    }

    struct LocalVars {
        uint256 expirationIdMin;
        uint256 expirationIdMax;
        uint256 underlyingPrice;
        uint256 volatility;
        uint64[] allSeries;
        uint256[] lockedValue;
        uint256[] poolValue;
        uint256[] wTokenAmounts;
    }

    /// Lock active wTokens grouped by expiration
    /// Assign number of shares to the locking address
    function lockActiveWTokens(
        uint256 lpTokenAmount,
        uint256 lpTokenSupply,
        address redeemer,
        uint256 volatility
    ) external override {
        LocalVars memory vars;

        ISeriesController seriesController = ISeriesController(
            addressesProvider.getSeriesController()
        );
        IMinterAmm amm = IMinterAmm(msg.sender);
        vars.allSeries = amm.getAllSeries();

        (vars.expirationIdMin, vars.expirationIdMax) = seriesController
            .getExpirationIdRange();

        if (vars.allSeries.length > 0) {
            address underlyingToken = address(amm.underlyingToken());
            address priceToken = address(amm.priceToken());

            vars.underlyingPrice = IPriceOracle(
                addressesProvider.getPriceOracle()
            ).getCurrentPrice(underlyingToken, priceToken);

            vars.volatility = volatility;
        }

        vars.lockedValue = new uint256[](
            vars.expirationIdMax - vars.expirationIdMin + 1
        );
        vars.poolValue = new uint256[](
            vars.expirationIdMax - vars.expirationIdMin + 1
        );
        vars.wTokenAmounts = new uint256[](
            vars.expirationIdMax - vars.expirationIdMin + 1
        );

        for (uint256 i = 0; i < vars.allSeries.length; i++) {
            uint64 seriesId = vars.allSeries[i];
            ISeriesController.Series memory series = seriesController.series(
                seriesId
            );

            if (
                seriesController.state(seriesId) ==
                ISeriesController.SeriesState.OPEN
            ) {
                uint256 wTokenIndex = SeriesLibrary.wTokenIndex(seriesId);

                uint256 wTokenAmount = (IERC1155(
                    seriesController.erc1155Controller()
                ).balanceOf(address(amm), wTokenIndex) * lpTokenAmount) /
                    lpTokenSupply;

                uint256 expirationId = seriesController.allowedExpirationsMap(
                    series.expirationDate
                );

                uint256 bPrice = IAmmDataProvider(
                    addressesProvider.getAmmDataProvider()
                ).getPriceForSeries(seriesId, vars.volatility);

                uint256 valuePerToken;
                if (series.isPutOption) {
                    valuePerToken = seriesController.getCollateralPerUnderlying(
                            seriesId,
                            (series.strikePrice * 1e18) /
                                vars.underlyingPrice -
                                bPrice,
                            vars.underlyingPrice
                        );
                } else {
                    valuePerToken = 1e18 - bPrice;
                }

                uint256 poolWTokenBalance = lockedWTokens[address(amm)][
                    seriesId
                ];
                if (poolWTokenBalance > 0) {
                    vars.poolValue[expirationId - vars.expirationIdMin] +=
                        (poolWTokenBalance * valuePerToken) /
                        1e18;
                }

                if (wTokenAmount > 0) {
                    // Increase locked wToken amount
                    lockedWTokens[address(amm)][seriesId] += wTokenAmount;
                    vars.lockedValue[expirationId - vars.expirationIdMin] +=
                        (wTokenAmount * valuePerToken) /
                        1e18;
                    vars.wTokenAmounts[
                        expirationId - vars.expirationIdMin
                    ] += wTokenAmount;
                }
            }
        }

        for (
            uint64 i = 0;
            i <= vars.expirationIdMax - vars.expirationIdMin;
            i++
        ) {
            if (vars.lockedValue[i] > 0) {
                uint256 expirationDate = seriesController
                    .allowedExpirationsList(i + vars.expirationIdMin);
                // Add locked collateral to the expiration ID
                vars.poolValue[i] += lockedCollateral[address(amm)][
                    expirationDate
                ];

                // Update LP shares balance and supply
                uint256 existingSupply = lpSharesSupply[address(amm)][
                    expirationDate
                ];
                uint256 newSupply;
                if (existingSupply == 0) {
                    newSupply = vars.lockedValue[i];
                } else {
                    newSupply =
                        ((vars.poolValue[i] + vars.lockedValue[i]) *
                            existingSupply) /
                        vars.poolValue[i];
                }

                lpShares[address(amm)][expirationDate][redeemer] +=
                    newSupply -
                    existingSupply;
                lpSharesSupply[address(amm)][expirationDate] = newSupply;

                emit WTokensLocked(
                    address(amm),
                    redeemer,
                    expirationDate,
                    vars.wTokenAmounts[i],
                    newSupply - existingSupply
                );
            }
        }
    }

    /// Redeem locked collateral
    function redeemCollateral(uint256 expirationDate, address redeemer)
        external
        override
        returns (uint256)
    {
        // Don't allow redemptions until expiration is reached
        if (expirationDate > block.timestamp) return 0;

        address ammAddress = msg.sender;

        require(
            lpShares[ammAddress][expirationDate][redeemer] > 0,
            "No shares in this pool"
        );

        uint256 numShares = lpShares[ammAddress][expirationDate][redeemer];

        uint256 collateralAmount = (lockedCollateral[ammAddress][
            expirationDate
        ] * numShares) / lpSharesSupply[ammAddress][expirationDate];

        uint256 redeemed = redeemedCollateral[ammAddress][expirationDate][
            redeemer
        ];

        if (collateralAmount > redeemed) {
            redeemedCollateral[ammAddress][expirationDate][
                redeemer
            ] = collateralAmount;

            collateralAmount -= redeemed;
        } else {
            // Don't emmit event if nothing is redeemed
            return 0;
        }

        emit LpSharesRedeemed(
            ammAddress,
            redeemer,
            expirationDate,
            numShares,
            collateralAmount
        );

        return collateralAmount;
    }

    /// Add locked collateral to an expiration pool
    function lockCollateral(
        uint64 seriesId,
        uint256 collateralAmount,
        uint256 wTokenAmount
    ) external override {
        address ammAddress = msg.sender;
        ISeriesController seriesController = ISeriesController(
            addressesProvider.getSeriesController()
        );

        ISeriesController.Series memory series = seriesController.series(
            seriesId
        );

        lockedCollateral[ammAddress][series.expirationDate] += collateralAmount;
        lockedWTokens[ammAddress][seriesId] -= wTokenAmount;

        emit CollateralLocked(
            ammAddress,
            series.expirationDate,
            collateralAmount,
            wTokenAmount
        );
    }

    // View functions for front-end //

    /// Get value of all locked wTokens for a given expiration date
    function getLockedValue(address _ammAddress, uint256 _expirationDate)
        external
        view
        override
        returns (uint256)
    {
        LocalVars memory vars;

        ISeriesController seriesController = ISeriesController(
            addressesProvider.getSeriesController()
        );
        IMinterAmm amm = IMinterAmm(_ammAddress);
        vars.allSeries = amm.getAllSeries();

        if (vars.allSeries.length > 0) {
            address underlyingToken = address(amm.underlyingToken());
            address priceToken = address(amm.priceToken());

            vars.underlyingPrice = IPriceOracle(
                addressesProvider.getPriceOracle()
            ).getCurrentPrice(underlyingToken, priceToken);

            vars.volatility = amm.getBaselineVolatility();
        }

        uint256 lockedValue = 0;

        for (uint256 i = 0; i < vars.allSeries.length; i++) {
            uint64 seriesId = vars.allSeries[i];
            ISeriesController.Series memory series = seriesController.series(
                seriesId
            );

            if (
                seriesController.state(seriesId) ==
                ISeriesController.SeriesState.OPEN
            ) {
                if (series.expirationDate != _expirationDate) continue;

                uint256 bPrice = IAmmDataProvider(
                    addressesProvider.getAmmDataProvider()
                ).getPriceForSeries(seriesId, vars.volatility);

                uint256 valuePerToken;
                if (series.isPutOption) {
                    valuePerToken = seriesController.getCollateralPerUnderlying(
                            seriesId,
                            (series.strikePrice * 1e18) /
                                vars.underlyingPrice -
                                bPrice,
                            vars.underlyingPrice
                        );
                } else {
                    valuePerToken = 1e18 - bPrice;
                }

                uint256 poolWTokenBalance = lockedWTokens[address(amm)][
                    seriesId
                ];
                if (poolWTokenBalance > 0) {
                    lockedValue += (poolWTokenBalance * valuePerToken) / 1e18;
                }
            }
        }

        return lockedValue;
    }

    /// Get redeemable collateral including expired wTokens
    function getRedeemableCollateral(
        address _ammAddress,
        uint256 _expirationDate
    ) external override returns (uint256) {
        IMinterAmm amm = IMinterAmm(_ammAddress);
        amm.claimAllExpiredTokens();

        return lockedCollateral[_ammAddress][_expirationDate];
    }
}

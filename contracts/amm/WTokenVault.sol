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

    /// total supply of pool shares
    mapping(address => uint256) public lpSharesSupply;

    /// balance of shares for each LP
    mapping(address => mapping(address => uint256)) public lpShares;

    /// locked collateral
    mapping(address => uint256) public lockedCollateral;

    /// redeemed collateral by LP
    mapping(address => mapping(address => uint256)) public redeemedCollateral;

    function initialize(IAddressesProvider _addressesProvider)
        external
        initializer
    {
        addressesProvider = _addressesProvider;
        __Ownable_init();
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
        uint256 underlyingPrice;
        uint256 volatility;
        uint64[] allSeries;
        uint256 lockedValue;
        uint256 poolValue;
    }

    /// Lock active wTokens
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

        if (vars.allSeries.length > 0) {
            address underlyingToken = address(amm.underlyingToken());
            address priceToken = address(amm.priceToken());

            vars.underlyingPrice = IPriceOracle(
                addressesProvider.getPriceOracle()
            ).getCurrentPrice(underlyingToken, priceToken);

            vars.volatility = volatility;
        }

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
                    vars.poolValue +=
                        (poolWTokenBalance * valuePerToken) /
                        1e18;
                }

                if (wTokenAmount > 0) {
                    // Increase locked wToken amount
                    lockedWTokens[address(amm)][seriesId] += wTokenAmount;
                    vars.lockedValue += (wTokenAmount * valuePerToken) / 1e18;
                }
            }
        }

        if (vars.lockedValue > 0) {
            // Add locked collateral
            vars.poolValue += lockedCollateral[address(amm)];

            // Update LP shares balance and supply
            uint256 existingSupply = lpSharesSupply[address(amm)];
            uint256 newSupply;
            if (existingSupply == 0) {
                newSupply = vars.lockedValue;
            } else {
                newSupply =
                    ((vars.poolValue + vars.lockedValue) * existingSupply) /
                    vars.poolValue;
            }

            lpShares[address(amm)][redeemer] += newSupply - existingSupply;
            lpSharesSupply[address(amm)] = newSupply;

            emit WTokensLocked(
                address(amm),
                redeemer,
                newSupply - existingSupply
            );
        }
    }

    /// Redeem unlocked collateral
    function redeemCollateral(address redeemer)
        external
        override
        returns (uint256)
    {
        address ammAddress = msg.sender;

        require(lpShares[ammAddress][redeemer] > 0, "No shares in locked pool");

        uint256 numShares = lpShares[ammAddress][redeemer];

        uint256 collateralAmount = (lockedCollateral[ammAddress] * numShares) /
            lpSharesSupply[ammAddress];

        uint256 redeemed = redeemedCollateral[ammAddress][redeemer];
        require(collateralAmount > redeemed, "No collateral to redeem");

        redeemedCollateral[ammAddress][redeemer] = collateralAmount;

        collateralAmount -= redeemed;

        emit LpSharesRedeemed(
            ammAddress,
            redeemer,
            numShares,
            collateralAmount
        );

        return collateralAmount;
    }

    /// Add unlocked collateral
    function lockCollateral(
        uint64 seriesId,
        uint256 collateralAmount,
        uint256 wTokenAmount
    ) external override {
        address ammAddress = msg.sender;
        lockedCollateral[ammAddress] += collateralAmount;
        lockedWTokens[ammAddress][seriesId] -= wTokenAmount;

        emit CollateralLocked(
            ammAddress,
            seriesId,
            collateralAmount,
            wTokenAmount
        );
    }
}

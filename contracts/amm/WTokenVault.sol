pragma solidity 0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../proxy/Proxiable.sol";
import "./IMinterAmm.sol";
import "./MinterAmmStorage.sol";
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

    mapping(address => mapping(uint64 => uint256)) public lockedWTokens;

    mapping(address => mapping(uint256 => uint256)) public lpSharesSupply;

    mapping(address => mapping(uint256 => mapping(address => uint256)))
        public lpShares;

    mapping(address => mapping(uint64 => bool)) public isPoolClaimable;

    mapping(address => mapping(uint64 => uint256)) public lockedCollateral;

    function initialize(IAddressesProvider _addressesProvider)
        external
        initializer
    {
        addressesProvider = _addressesProvider;
        __Ownable_init();
    }

    function setPoolClaimable(uint64 expirationId, bool isClaimable) external {
        isPoolClaimable[msg.sender][expirationId] = isClaimable;
    }

    function getWTokenBalance(address poolAddress, uint64 seriesId)
        external
        override
        returns (uint256)
    {
        return lockedWTokens[poolAddress][seriesId];
    }

    struct LocalVars {
        uint256 underlyingPrice;
        uint256 volatility;
        uint64[] allSeries;
        uint64[] allExpirations;
        uint256[] lockedValue;
        uint256[] poolValue;
    }

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

        // TODO: get expirations from series controller when ready
        vars.allExpirations = new uint64[](1);
        vars.allExpirations[0] = 111111;

        if (vars.allSeries.length > 0) {
            MinterAmmStorageV2 ammStorage = MinterAmmStorageV2(address(amm));
            address underlyingToken = address(ammStorage.underlyingToken());
            address priceToken = address(ammStorage.priceToken());

            // we assume the openSeries are all from the same AMM, and thus all its Series
            // use the same underlying and price tokens, so we can arbitrarily choose the first
            // when fetching the necessary token addresses
            vars.underlyingPrice = IPriceOracle(
                addressesProvider.getPriceOracle()
            ).getCurrentPrice(underlyingToken, priceToken);

            vars.volatility = volatility;
        }

        vars.lockedValue = new uint256[](vars.allExpirations.length);
        vars.poolValue = new uint256[](vars.allExpirations.length);

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

                // TODO: need to be able to get expiration id for series `seriesController.expirationId(seriesId)`
                uint64 expirationId = 0;

                uint256 bPrice = IAmmDataProvider(
                    addressesProvider.getAmmDataProvider()
                ).getPriceForSeries(seriesId, vars.volatility);

                uint256 valuePerToken;
                if (series.isPutOption) {
                    valuePerToken += seriesController
                        .getCollateralPerUnderlying(
                            seriesId,
                            wTokenAmount *
                                ((series.strikePrice * 1e18) /
                                    vars.underlyingPrice -
                                    bPrice),
                            vars.underlyingPrice
                        );
                } else {
                    valuePerToken += wTokenAmount * (1e18 - bPrice);
                }

                uint256 poolWTokenBalance = lockedWTokens[address(amm)][
                    seriesId
                ];
                if (poolWTokenBalance > 0) {
                    vars.poolValue[expirationId] +=
                        (poolWTokenBalance * valuePerToken) /
                        1e18;
                }

                if (wTokenAmount > 0) {
                    // Increase locked wToken amount
                    lockedWTokens[address(amm)][seriesId] += wTokenAmount;
                    vars.lockedValue[expirationId] +=
                        (wTokenAmount * valuePerToken) /
                        1e18;
                }
            }
        }

        for (uint64 i = 0; i < vars.allExpirations.length; i++) {
            if (vars.lockedValue[i] > 0) {
                // Add locked collateral to the expiration ID
                vars.poolValue[i] += lockedCollateral[address(amm)][i];

                // Update LP shares balance and supply
                uint256 existingSupply = lpSharesSupply[address(amm)][i];
                uint256 newSupply = ((vars.poolValue[i] + vars.lockedValue[i]) *
                    existingSupply) / vars.poolValue[i];
                lpShares[address(amm)][i][redeemer] +=
                    newSupply -
                    existingSupply;
                lpSharesSupply[address(amm)][i] = newSupply;
            }
        }
    }

    function redeemCollateral(uint64 expirationId, address redeemer)
        external
        override
        returns (uint256)
    {
        address ammAddress = msg.sender;
        require(
            isPoolClaimable[ammAddress][expirationId],
            "Pool is not yet claimable"
        );

        uint256 collateralAmount = (lockedCollateral[ammAddress][expirationId] *
            lpShares[ammAddress][expirationId][redeemer]) /
            lpSharesSupply[ammAddress][expirationId];

        // Burn LP shares
        uint256 numShares = lpShares[msg.sender][expirationId][redeemer];
        lpShares[msg.sender][expirationId][redeemer] = 0;
        lpSharesSupply[msg.sender][expirationId] -= numShares;

        // TODO: emit event

        return collateralAmount;
    }

    function addCollateral(
        uint64 seriesId,
        uint256 collateralAmount,
        uint256 wTokenAmount
    ) external override {
        address ammAddress = msg.sender;

        // TODO: ability to get expirationId by seriesId from SeriesController
        uint64 expirationId = 0;

        lockedCollateral[ammAddress][expirationId] += collateralAmount;
        lockedWTokens[ammAddress][seriesId] -= wTokenAmount;

        // TODO: emit event
    }
}

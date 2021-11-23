// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "../libraries/Math.sol";
import "../proxy/Proxiable.sol";
import "../proxy/Proxy.sol";
import "./InitializeableAmm.sol";
import "./IAddSeriesToAmm.sol";
import "../series/IPriceOracle.sol";
import "../swap/ILight.sol";
import "../token/IERC20Lib.sol";
import "../oz/EnumerableSet.sol";
import "../series/SeriesLibrary.sol";
import "./MinterAmmStorage.sol";
import "../series/IVolatilityOracle.sol";
import "./IBlackScholes.sol";
import "./AmmDataProvider.sol";

import "hardhat/console.sol";

/// This is an implementation of a minting/redeeming AMM (Automated Market Maker) that trades a list of series with the same
/// collateral token. For example, a single WBTC Call AMM contract can trade all strikes of WBTC calls using
/// WBTC as the collateral, and a single WBTC Put AMM contract can trade all strikes of WBTC puts, using
/// USDC as the collateral.
///
/// Each AMM uses a triplet of ERC20 tokens to define the option asset whose price determines the option's value
/// (the underlyingToken), the token used to denominate the strike price (the priceToken) and the token used
/// as collateral writing the option (the collateralToken). The collateralToken also determines the units used
/// in pricing the option's premiums.
///
/// It uses an on-chain Black-Scholes approximation to calculate the price of a single option (which we represent by an
/// ERC1155 token we call "bToken"). The Black-Scholes approximation uses an on-chain oracle price feed to get the
/// current series price of the underlying asset. By using an on-chain oracle the AMM's bonding curve is aware of the
/// time-dependent nature of options pricing (a.k.a. theta-decay), and can price options better than a naive constant
/// product bonding curve such as Uniswap.
///
/// In addition, it uses a novel "mint aware bonding curve" to allow for infinite depth when buying options. A user
/// pays for options in units of the AMM's collateral token, and the AMM uses this collateral to mint additional bTokens
/// to satisfy the user's trade size
///
/// External users can buy bTokens with collateral (wToken trading is disabled in this version).
/// When they do this, the AMM will mint new bTokens and wTokens, sell the wToken to the AMM for more bToken,
/// and transfer the bToken to the user.
///
/// External users can sell bTokens for collateral. When they do this, the AMM will sell a partial amount of assets
/// to get a 50/50 split between bTokens and wTokens, then redeem them for collateral and transfer the collateral back to
/// the user.
///
/// If fees are enabled (3 params are configured: trade fee, max fee, and fee destination) a trade fee will be collected and
/// sent to an external acct.  Fee calculations mimic the Deribit fee schedule (see https://www.deribit.com/pages/information/fees for
/// their explanation with examples of BTC/ETH options). Each buy/sell has a trade fee percentage
/// based on the number of underlying option contracts (bToken amt) priced in the collateral token.
/// Additionally, there is a max fee percentage based on the option value being bought or sold (collateral paid or received).
/// The lower of the 2 fees calculated will be used.  Fees are paid out on each buy or sell of bTokens to a configured address.
///
/// Fee Example: If trade fee is 3 basis points and max fee is 1250 basis points and a buy of bTokens is priced at 0.0001 collateral
/// tokens, the fee will be 0.0000125 collateral tokens (using the max fee). If the option prices are much higher then 0.0003
/// of collateral would be the fee for each bToken.
///
/// LPs can provide collateral for liquidity. All collateral will be used to mint bTokens/wTokens for each trade.
/// They will be given a corresponding amount of lpTokens to track ownership. The amount of lpTokens is calculated based on
/// total pool value which includes collateral token, active b/wTokens and expired/unclaimed b/wTokens
///
/// LPs can withdraw collateral from liquidity. When withdrawing user can specify if they want their pro-rata b/wTokens
/// to be automatically sold to the pool for collateral. If the chose not to sell then they get pro-rata of all tokens
/// in the pool (collateral, bToken, wToken). If they chose to sell then their bTokens and wTokens will be sold
/// to the pool for collateral incurring slippage.
///
/// All expired unclaimed wTokens are automatically claimed on each deposit or withdrawal
///
/// All conversions between bToken and wToken in the AMM will generate fees that will be send to the protocol fees pool
/// (disabled in this version)
contract MinterAmm is
    InitializeableAmm,
    ERC1155HolderUpgradeable,
    IAddSeriesToAmm,
    OwnableUpgradeable,
    Proxiable,
    MinterAmmStorageV2
{
    /// @dev NOTE: No local variables should be added here.  Instead see MinterAmmStorageV*.sol

    /// Use safe ERC20 functions for any token transfers since people don't follow the ERC20 standard */
    using SafeERC20 for IERC20;
    using SafeERC20 for ISimpleToken;

    using EnumerableSet for EnumerableSet.UintSet;

    /// Emitted when the amm is created
    event AMMInitialized(
        ISimpleToken lpToken,
        address sirenPriceOracle,
        address controller
    );

    /// Emitted when an LP deposits collateral
    event LpTokensMinted(
        address minter,
        uint256 collateralAdded,
        uint256 lpTokensMinted
    );

    /// Emitted when an LP withdraws collateral
    event LpTokensBurned(
        address redeemer,
        uint256 collateralRemoved,
        uint256 lpTokensBurned
    );

    /// Emitted when a user buys bTokens from the AMM
    event BTokensBought(
        address buyer,
        uint64 seriesId,
        uint256 bTokensBought,
        uint256 collateralPaid
    );

    /// Emitted when a user sells bTokens to the AMM
    event BTokensSold(
        address seller,
        uint64 seriesId,
        uint256 bTokensSold,
        uint256 collateralPaid
    );

    /// Emitted when a user sells wTokens to the AMM
    event WTokensSold(
        address seller,
        uint64 seriesId,
        uint256 wTokensSold,
        uint256 collateralPaid
    );

    /// Emitted when the owner updates volatilityFactor
    /// TODO: update this to emmit the series id and the volatility
    event VolatilityFactorUpdated(uint256 newVolatilityFactor);

    /// Emitted when a new sirenPriceOracle gets set on an upgraded AMM
    event NewSirenPriceOracle(address newSirenPriceOracle);

    /// Emitted when a new ammDataProviders gets set on an upgraded AMM
    event NewAmmDataProvider(address newAmmDataProvider);

    /// @notice Emitted when an expired series has been removed
    event SeriesEvicted(uint64 seriesId);

    /// Emitted when the owner updates fee params
    event TradeFeesUpdated(
        uint16 newTradeFeeBasisPoints,
        uint16 newMaxOptionFeeBasisPoints,
        address newFeeDestinationAddress
    );

    // Emitted when fees are paid
    event TradeFeesPaid(address indexed feePaidTo, uint256 feeAmount);

    // Emitted when owner updates
    event NewLightAirswapAddress(address newLightAirswapAddress);

    // Error codes. We only use error code because we need to reduce the size of this contract's deployed
    // bytecode in order for it to be deployable

    // E02: Invalid _sirenPriceOracle
    // E03: Invalid _underlyingToken
    // E04: Invalid _priceToken
    // E05: Invalid _collateralToken
    // E06: _underlyingToken cannot equal _priceToken
    // E07: Invalid _tokenImplementation
    // E08: Contract can only be initialized once
    // E09: VolatilityFactor is too low
    // E10: Invalid _newImplementation
    // E11: Can only be called by SeriesController
    // E12: withdrawCapital: collateralMinimum must be set
    // E13: Series does not exist on this AMM
    // E14: Invalid _newAmmDataProvider
    // E15: Invalid _ammDataProvider
    // E16: Invalid lightAirswapAddress

    /// @dev Require minimum trade size to prevent precision errors at low values
    modifier minTradeSize(uint256 tradeSize) {
        require(
            tradeSize >= MINIMUM_TRADE_SIZE,
            "Buy/Sell amount below min size"
        );
        _;
    }

    /// @dev Prevents a contract from calling itself, directly or indirectly.
    /// Calling a `nonReentrant` function from another `nonReentrant`
    /// function is not supported. It is possible to prevent this from happening
    /// by making the `nonReentrant` function external, and make it call a
    /// `private` function that does the actual work.
    modifier nonReentrant() {
        // On the first call to nonReentrant, _notEntered will be true
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _status = _ENTERED;

        _;

        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = _NOT_ENTERED;
    }

    /// Initialize the contract, and create an lpToken to track ownership
    function initialize(
        ISeriesController _seriesController,
        address _sirenPriceOracle,
        address _ammDataProvider,
        IAddressesProvider _addressesProvider,
        IERC20 _underlyingToken,
        IERC20 _priceToken,
        IERC20 _collateralToken,
        address _tokenImplementation,
        uint16 _tradeFeeBasisPoints
    ) public override {
        require(address(_sirenPriceOracle) != address(0x0), "E02");
        require(_ammDataProvider != address(0x0), "E15");
        require(address(_underlyingToken) != address(0x0), "E03");
        require(address(_priceToken) != address(0x0), "E04");
        require(address(_collateralToken) != address(0x0), "E05");
        require(address(_underlyingToken) != address(_priceToken), "E06");
        require(_tokenImplementation != address(0x0), "E07");

        // Enforce initialization can only happen once
        require(!initialized, "E08");
        initialized = true;

        // Save off state variables
        seriesController = _seriesController;
        addressesProvider = _addressesProvider;
        ammDataProvider = _ammDataProvider;
        erc1155Controller = IERC1155(_seriesController.erc1155Controller());

        // Approve seriesController to move tokens
        erc1155Controller.setApprovalForAll(address(seriesController), true);

        sirenPriceOracle = _sirenPriceOracle;
        tradeFeeBasisPoints = _tradeFeeBasisPoints;

        // Save off series tokens
        underlyingToken = _underlyingToken;
        priceToken = _priceToken;
        collateralToken = _collateralToken;

        // Create the lpToken and initialize it
        Proxy lpTokenProxy = new Proxy(_tokenImplementation);
        lpToken = ISimpleToken(address(lpTokenProxy));

        // AMM name will be <underlying>-<price>-<collateral>, e.g. WBTC-USDC-WBTC for a WBTC Call AMM
        string memory ammName = string(
            abi.encodePacked(
                IERC20Lib(address(underlyingToken)).symbol(),
                "-",
                IERC20Lib(address(priceToken)).symbol(),
                "-",
                IERC20Lib(address(collateralToken)).symbol()
            )
        );
        string memory lpTokenName = string(abi.encodePacked("LP-", ammName));
        lpToken.initialize(
            lpTokenName,
            lpTokenName,
            IERC20Lib(address(collateralToken)).decimals()
        );

        __Ownable_init();

        // Store the variable references for passing to libraries
        refs = AmmDataProvider.References(
            erc1155Controller,
            seriesController,
            IPriceOracle(sirenPriceOracle),
            _addressesProvider
        );

        emit AMMInitialized(
            lpToken,
            _sirenPriceOracle,
            address(_seriesController)
        );
    }

    /// The owner can set the volatility factor used to price the options
    function getVolatility(uint64 _seriesId) public view returns (uint256) {
        return
            uint256(
                IVolatilityOracle(addressesProvider.getVolatilityOracle())
                    .annualizedVol(
                        address(underlyingToken),
                        address(priceToken)
                    )
            ) *
            1e10 + // oracle stores volatility in 8 decimals precision, here we operate at 18 decimals
            2e17; // bump IV by 20% to give LPs an edge until the dynamic IV is implemented
    }

    /// Each time a trade happens we update the volatility
    function updateVolatility(
        uint64 _seriesId,
        int256 priceImpact,
        uint256 currentIV,
        uint256 vega
    ) internal {
        // To be implemented
    }

    /// The owner can set the trade fee params - if any are set to 0/0x0 then trade fees are disabled
    function setTradingFeeParams(
        uint16 _tradeFeeBasisPoints,
        uint16 _maxOptionFeeBasisPoints,
        address _feeDestinationAddress
    ) public onlyOwner {
        tradeFeeBasisPoints = _tradeFeeBasisPoints;
        maxOptionFeeBasisPoints = _maxOptionFeeBasisPoints;
        feeDestinationAddress = _feeDestinationAddress;
        emit TradeFeesUpdated(
            tradeFeeBasisPoints,
            maxOptionFeeBasisPoints,
            feeDestinationAddress
        );
    }

    /// @notice update the logic contract for this proxy contract
    /// @param _newImplementation the address of the new MinterAmm implementation
    /// @dev only the admin address may call this function
    function updateImplementation(address _newImplementation)
        external
        onlyOwner
    {
        require(_newImplementation != address(0x0), "E10");

        _updateCodeAddress(_newImplementation);
    }

    /// @notice update the AmmDataProvider used by this AMM
    /// @param _newAmmDataProvider the address of the new AmmDataProvider contract
    /// @dev only the admin address may call this function
    function updateAmmDataProvider(address _newAmmDataProvider)
        external
        onlyOwner
    {
        require(_newAmmDataProvider != address(0x0), "E14");

        ammDataProvider = _newAmmDataProvider;

        emit NewAmmDataProvider(_newAmmDataProvider);
    }

    /// @notice update the address for the airswap lib used for direct buys
    /// @param _lightAirswapAddress the new address to use
    /// @dev only the admin address may call this function
    /// @dev setting the address to 0x0 will disable this functionality
    function updateLightAirswapAddress(address _lightAirswapAddress)
        external
        onlyOwner
    {
        lightAirswapAddress = _lightAirswapAddress;

        emit NewLightAirswapAddress(_lightAirswapAddress);
    }

    /// LP allows collateral to be used to mint new options
    /// bTokens and wTokens will be held in this contract and can be traded back and forth.
    /// The amount of lpTokens is calculated based on total pool value
    function provideCapital(uint256 collateralAmount, uint256 lpTokenMinimum)
        external
        nonReentrant
    {
        // Move collateral into this contract
        collateralToken.safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );

        // If first LP, mint options, mint LP tokens, and send back any redemption amount
        if (IERC20Lib(address(lpToken)).totalSupply() == 0) {
            // Mint lp tokens to the user
            lpToken.mint(msg.sender, collateralAmount);

            // Emit event
            LpTokensMinted(msg.sender, collateralAmount, collateralAmount);

            // Bail out after initial tokens are minted - nothing else to do
            return;
        }

        // At any given moment the AMM can have the following reserves:
        // * collateral token
        // * active bTokens and wTokens for any series
        // * expired bTokens and wTokens for any series
        // In order to calculate correct LP amount we do the following:
        // 1. Claim expired wTokens and bTokens
        // 2. Add value of all active bTokens and wTokens at current prices
        // 3. Add value of collateral

        claimAllExpiredTokens();

        uint256 poolValue = getTotalPoolValue(false);

        // Mint LP tokens - the percentage added to bTokens should be same as lp tokens added
        uint256 lpTokenExistingSupply = IERC20Lib(address(lpToken))
            .totalSupply();

        uint256 lpTokensNewSupply = (poolValue * lpTokenExistingSupply) /
            (poolValue - collateralAmount);
        uint256 lpTokensToMint = lpTokensNewSupply - lpTokenExistingSupply;
        require(lpTokensToMint >= lpTokenMinimum, "Slippage exceeded");
        lpToken.mint(msg.sender, lpTokensToMint);

        // Emit event
        emit LpTokensMinted(msg.sender, collateralAmount, lpTokensToMint);
    }

    /// LP can redeem their LP tokens in exchange for collateral
    /// If `sellTokens` is true pro-rata active b/wTokens will be sold to the pool in exchange for collateral
    /// All expired wTokens will be claimed
    /// LP will get pro-rata collateral asset
    function withdrawCapital(
        uint256 lpTokenAmount,
        bool sellTokens,
        uint256 collateralMinimum
    ) public nonReentrant {
        require(!sellTokens || collateralMinimum > 0, "E12");
        // First get starting numbers
        uint256 redeemerCollateralBalance = collateralToken.balanceOf(
            msg.sender
        );

        // Get the lpToken supply
        uint256 lpTokenSupply = IERC20Lib(address(lpToken)).totalSupply();

        // Burn the lp tokens
        lpToken.burn(msg.sender, lpTokenAmount);

        // Claim all expired wTokens
        claimAllExpiredTokens();

        uint256 collateralTokenBalance = collateralToken.balanceOf(
            address(this)
        );

        // Withdraw pro-rata collateral token
        // We withdraw this collateral here instead of at the end,
        // because when we sell the residual tokens to the pool we want
        // to exclude the withdrawn collateral
        uint256 ammCollateralBalance = collateralTokenBalance -
            ((collateralTokenBalance * lpTokenAmount) / lpTokenSupply);

        // Sell pro-rata active tokens or withdraw if no collateral left
        ammCollateralBalance = _sellOrWithdrawActiveTokens(
            lpTokenAmount,
            lpTokenSupply,
            msg.sender,
            sellTokens,
            ammCollateralBalance
        );

        // Send all accumulated collateralTokens
        collateralToken.safeTransfer(
            msg.sender,
            collateralTokenBalance - ammCollateralBalance
        );

        uint256 collateralTokenSent = collateralToken.balanceOf(msg.sender) -
            redeemerCollateralBalance;
        require(
            !sellTokens || collateralTokenSent >= collateralMinimum,
            "Slippage exceeded"
        );

        // Emit the event
        emit LpTokensBurned(msg.sender, collateralTokenSent, lpTokenAmount);
    }

    /// @notice Claims any remaining collateral from all expired series whose wToken is held by the AMM, and removes
    /// the expired series from the AMM's collection of series
    function claimAllExpiredTokens() public {
        for (uint256 i = 0; i < openSeries.length(); i++) {
            uint64 seriesId = uint64(openSeries.at(i));
            while (
                seriesController.state(seriesId) ==
                ISeriesController.SeriesState.EXPIRED
            ) {
                claimExpiredTokens(seriesId);

                // Handle edge case: If, prior to removing the Series, i was the index of the last Series
                // in openSeries, then after the removal `i` will point to one beyond the end of the array.
                // This means we've iterated through all of the Series in `openSeries`, and we should break
                // out of the while loop. At this point i == openSeries.length(), so the outer for loop
                // will end as well
                if (i == openSeries.length()) {
                    break;
                } else {
                    seriesId = uint64(openSeries.at(i));
                }
            }
        }
    }

    /// @notice Claims any remaining collateral from expired series whose wToken is held by the AMM, and removes
    /// the expired series from the AMM's collection of series
    function claimExpiredTokens(uint64 seriesId) public {
        // claim the expired series' wTokens, which means it can now be safely removed
        uint256 bTokenIndex = SeriesLibrary.bTokenIndex(seriesId);
        uint256 wTokenIndex = SeriesLibrary.wTokenIndex(seriesId);

        uint256 bTokenBalance = erc1155Controller.balanceOf(
            address(this),
            bTokenIndex
        );
        if (bTokenBalance > 0) {
            seriesController.exerciseOption(seriesId, bTokenBalance, false);
        }

        uint256 wTokenBalance = erc1155Controller.balanceOf(
            address(this),
            wTokenIndex
        );
        if (wTokenBalance > 0) {
            seriesController.claimCollateral(seriesId, wTokenBalance);
        }
        // Remove the expired series to free storage and reduce gas fee
        // NOTE: openSeries.remove will remove the series from the i’th position in the EnumerableSet by
        // swapping it with the last element in EnumerableSet and then calling .pop on the internal array.
        // We are relying on this undocumented behavior of EnumerableSet, which is acceptable because once
        // deployed we will never change the EnumerableSet logic.
        openSeries.remove(seriesId);

        emit SeriesEvicted(seriesId);
    }

    /// During liquidity withdrawal we either sell pro-rata active tokens back to the pool
    /// or withdraw them to the LP
    function _sellOrWithdrawActiveTokens(
        uint256 lpTokenAmount,
        uint256 lpTokenSupply,
        address redeemer,
        bool sellTokens,
        uint256 collateralLeft
    ) internal returns (uint256) {
        for (uint256 i = 0; i < openSeries.length(); i++) {
            uint64 seriesId = uint64(openSeries.at(i));
            if (
                seriesController.state(seriesId) ==
                ISeriesController.SeriesState.OPEN
            ) {
                uint256 bTokenIndex = SeriesLibrary.bTokenIndex(seriesId);
                uint256 wTokenIndex = SeriesLibrary.wTokenIndex(seriesId);

                uint256 bTokenToSell = (erc1155Controller.balanceOf(
                    address(this),
                    bTokenIndex
                ) * lpTokenAmount) / lpTokenSupply;
                uint256 wTokenToSell = (erc1155Controller.balanceOf(
                    address(this),
                    wTokenIndex
                ) * lpTokenAmount) / lpTokenSupply;
                if (!sellTokens || lpTokenAmount == lpTokenSupply) {
                    // Full LP token withdrawal for the last LP in the pool
                    // or if auto-sale is disabled
                    if (bTokenToSell > 0) {
                        bytes memory data;
                        erc1155Controller.safeTransferFrom(
                            address(this),
                            redeemer,
                            bTokenIndex,
                            bTokenToSell,
                            data
                        );
                    }
                    if (wTokenToSell > 0) {
                        bytes memory data;
                        erc1155Controller.safeTransferFrom(
                            address(this),
                            redeemer,
                            wTokenIndex,
                            wTokenToSell,
                            data
                        );
                    }
                } else {
                    // The LP sells their bToken and wToken to the AMM. The AMM
                    // pays the LP by reducing collateralLeft, which is what the
                    // AMM's collateral balance will be after executing this
                    // transaction (see MinterAmm.withdrawCapital to see where
                    // _sellOrWithdrawActiveTokens gets called)
                    uint256 bTokenPrice = getPriceForSeries(seriesId);
                    uint256 collateralAmountB = optionTokenGetCollateralOutInternal(
                            seriesId,
                            bTokenToSell,
                            collateralLeft,
                            bTokenPrice,
                            true
                        );

                    // Note! It's possible that either of the two subraction operations
                    // below will underflow and return an error. This will only
                    // happen if the AMM does not have sufficient collateral
                    // balance to buy the bToken and wToken from the LP. If this
                    // happens, this transaction will revert with a
                    // "revert" error message
                    collateralLeft -= collateralAmountB;
                    uint256 collateralAmountW = optionTokenGetCollateralOutInternal(
                            seriesId,
                            wTokenToSell,
                            collateralLeft,
                            bTokenPrice,
                            false
                        );
                    collateralLeft -= collateralAmountW;
                }
            }
        }

        return collateralLeft;
    }

    /// Get value of all assets in the pool in units of this AMM's collateralToken.
    /// Can specify whether to include the value of expired unclaimed tokens
    function getTotalPoolValue(bool includeUnclaimed)
        public
        view
        returns (uint256)
    {
        return
            AmmDataProvider.getTotalPoolValue(
                refs,
                includeUnclaimed,
                getAllSeries(),
                collateralToken.balanceOf(address(this)),
                address(this),
                getAllVolatilities()
            );
    }

    /// @notice List the Series ids this AMM trades
    /// @notice Warning: there is no guarantee that the indexes
    /// of any individual Series will remain constant between blocks. At any
    /// point the indexes of a particular Series may change, so do not rely on
    /// the indexes obtained from this function
    /// @return an array of all the series IDs
    function getAllSeries() public view returns (uint64[] memory) {
        uint64[] memory series = new uint64[](openSeries.length());
        for (uint256 i = 0; i < openSeries.length(); i++) {
            series[i] = uint64(openSeries.at(i));
        }
        return series;
    }

    /// @notice List the Volatilies price each series trade
    /// @notice Warning: there is no guarantee that the indexes
    /// of any individual Series will remain constant between blocks. At any
    /// point the indexes of a particular Series may change, so do not rely on
    /// the indexes obtained from this function
    /// @return an array of all the series IDs
    function getAllVolatilities() public view returns (uint256[] memory) {
        uint256[] memory volatilies = new uint256[](openSeries.length());
        for (uint256 i = 0; i < openSeries.length(); i++) {
            uint64 seriesId = uint64(openSeries.at(i));
            volatilies[i] = getVolatility(seriesId);
        }
        return volatilies;
    }

    /// @notice Get a specific Series that this AMM trades
    /// @notice Warning: there is no guarantee that the indexes
    /// of any individual Series will remain constant between blocks. At any
    /// point the indexes of a particular Series may change, so do not rely on
    /// the indexes obtained from this function
    /// @param seriesId the ID of the Series
    /// @return an ISeries, if it exists
    function getSeries(uint64 seriesId)
        external
        view
        returns (ISeriesController.Series memory)
    {
        require(openSeries.contains(seriesId), "E13");
        return seriesController.series(seriesId);
    }

    /// This function determines reserves of a bonding curve for a specific series.
    /// Given price of bToken we determine what is the largest pool we can create such that
    /// the ratio of its reserves satisfy the given bToken price: Rb / Rw = (1 - Pb) / Pb
    function getVirtualReserves(uint64 seriesId)
        public
        view
        returns (uint256, uint256)
    {
        require(openSeries.contains(seriesId), "E13");

        return
            AmmDataProvider.getVirtualReserves(
                refs,
                seriesId,
                address(this),
                collateralToken.balanceOf(address(this)),
                getPriceForSeries(seriesId)
            );
    }

    /// @dev Get the current series price of the underlying token with units of priceToken,
    /// always with 8 decimals
    /// @dev For example, if underlying == WBTC and price == USDC, then this function will return
    /// 4500000000000 ($45_000 in human readable units)
    function getCurrentUnderlyingPrice() private view returns (uint256) {
        return
            IPriceOracle(sirenPriceOracle).getCurrentPrice(
                address(underlyingToken),
                address(priceToken)
            );
    }

    /// @notice Get the bToken price for given Series, in units of the collateral token
    /// and normalized to 1e18. We use a normalization factor of 1e18 because we need
    /// to represent fractional values, yet Solidity does not support floating point numerics.
    /// @notice For example, if this is a WBTC Call option pool and so
    /// the collateral token is WBTC, then a return value of 0.5e18 means X units of bToken
    /// have a price of 0.5 * X units of WBTC. Another example; if this were a WBTC Put
    /// option pool, and so the collateral token is USDC, then a return value of 0.1e18 means
    /// X units of bToken have a price of 0.1 * X * strikePrice units of USDC.
    /// @notice This value will always be between 0 and 1e18, so you can think of it as
    /// representing the price as a fraction of 1 collateral token unit
    function getPriceForSeries(uint64 seriesId) public view returns (uint256) {
        require(openSeries.contains(seriesId), "E13");

        return
            AmmDataProvider.getPriceForExpiredSeries(
                refs,
                seriesId,
                getVolatility(seriesId)
            );
    }

    /// @dev Allows an owner to invoke a Direct Buy against the AMM
    /// A direct buy allows a signer wallet to predetermine a number of option
    ///     tokens to buy (senderAmount) with the specified number of collateral payment tokens (signerTokens).
    /// The direct buy will first use the collateral in the AMM to mint the options and
    ///     then execute a swap with the signer using Airswap protocol.
    /// Only the owner should be allowed to execute a direct buy as this is a "guarded" call.
    /// Sender address in the Airswap protocol will be this contract address.
    function bTokenDirectBuy(
        uint64 seriesId,
        uint256 nonce, // Nonce on the airswap sig for the signer
        uint256 expiry, // Date until swap is valid
        address signerWallet, // Address of the buyer (signer)
        uint256 signerAmount, // Amount of collateral that will be paid for options by the signer
        uint256 senderAmount, // Amount of options to buy from the AMM
        uint8 v, // Sig of signer wallet for Airswap
        bytes32 r, // Sig of signer wallet for Airswap
        bytes32 s // Sig of signer wallet for Airswap
    ) external onlyOwner nonReentrant {
        require(openSeries.contains(seriesId), "E13");
        require(lightAirswapAddress != address(0x0), "E16");

        AmmDataProvider.executeBTokenDirectBuy(
            refs,
            AmmDataProvider.DirectBuyInfo(
                seriesId,
                nonce,
                expiry,
                signerWallet,
                signerAmount,
                senderAmount,
                v,
                r,
                s,
                collateralToken,
                lightAirswapAddress,
                tradeFeeBasisPoints,
                maxOptionFeeBasisPoints,
                feeDestinationAddress
            )
        );

        // Emit the event
        emit BTokensBought(signerWallet, seriesId, senderAmount, signerAmount);
    }

    /// @dev Buy bToken of a given series.
    /// We supply series index instead of series address to ensure that only supported series can be traded using this AMM
    /// collateralMaximum is used for slippage protection.
    /// @notice Trade fees are added to the collateral amount moved from the buyer's account to pay for the bToken
    function bTokenBuy(
        uint64 seriesId,
        uint256 bTokenAmount,
        uint256 collateralMaximum
    ) external minTradeSize(bTokenAmount) nonReentrant returns (uint256) {
        require(openSeries.contains(seriesId), "E13");

        require(
            seriesController.state(seriesId) ==
                ISeriesController.SeriesState.OPEN,
            "Series has expired"
        );
        uint256 collateralAmount;
        {
            (uint256 price, uint256 vega) = calculatePriceAndVega(seriesId);
            collateralAmount = bTokenGetCollateralInWithoutFees(
                seriesId,
                bTokenAmount,
                price
            );
            require(
                collateralAmount * 1e18 >= price * bTokenAmount,
                "Buy amount is too low"
            );

            uint256 priceImpact = (collateralAmount * 1e18) /
                bTokenAmount -
                price;

            updateVolatility(
                seriesId,
                int256(priceImpact),
                getVolatility(seriesId),
                vega
            );
        }

        uint256 totalCollateral = AmmDataProvider.executeBTokenBuy(
            refs,
            AmmDataProvider.BTokenBuyInfo(
                seriesId,
                bTokenAmount,
                collateralMaximum,
                collateralAmount,
                collateralToken,
                tradeFeeBasisPoints,
                maxOptionFeeBasisPoints,
                feeDestinationAddress
            )
        );

        // Emit the event
        emit BTokensBought(msg.sender, seriesId, bTokenAmount, totalCollateral);

        // Return the amount of collateral required to buy
        return totalCollateral;
    }

    /// @notice Sell the bToken of a given series to the AMM in exchange for collateral token
    /// @notice This call will fail if the caller tries to sell a bToken amount larger than the amount of
    /// wToken held by the AMM
    /// @notice Trade fees are subracted from the collateral amount moved to the seller's account in exchange for bTokens
    /// @param seriesId The ID of the Series to buy bToken on
    /// @param bTokenAmount The amount of bToken to sell (bToken has the same decimals as the underlying)
    /// @param collateralMinimum The lowest amount of collateral the caller is willing to receive as payment
    /// for their bToken. The actual amount of bToken received may be lower than this due to slippage
    function bTokenSell(
        uint64 seriesId,
        uint256 bTokenAmount,
        uint256 collateralMinimum
    ) external minTradeSize(bTokenAmount) nonReentrant returns (uint256) {
        require(openSeries.contains(seriesId), "E13");

        require(
            seriesController.state(seriesId) ==
                ISeriesController.SeriesState.OPEN,
            "Series has expired"
        );
        uint256 collateralAmount;
        {
            (uint256 price, uint256 vega) = calculatePriceAndVega(seriesId);

            collateralAmount = bTokenGetCollateralOutWithoutFees(
                seriesId,
                bTokenAmount,
                price
            );

            require(
                collateralAmount * 1e18 <= price * bTokenAmount,
                "Sell amount is too low"
            );

            updateVolatility(
                seriesId,
                int256((collateralAmount * 1e18) / bTokenAmount - price),
                getVolatility(seriesId),
                vega
            );
        }

        uint256 totalCollateral = AmmDataProvider.executeBTokenSell(
            refs,
            AmmDataProvider.BTokenSellInfo(
                seriesId,
                bTokenAmount,
                collateralMinimum,
                collateralAmount,
                collateralToken,
                tradeFeeBasisPoints,
                maxOptionFeeBasisPoints,
                feeDestinationAddress
            )
        );

        // Emit the event
        emit BTokensSold(msg.sender, seriesId, bTokenAmount, totalCollateral);

        // Return the amount of collateral received during sale
        return totalCollateral;
    }

    /// @notice Calculate premium (i.e. the option price) to buy bTokenAmount bTokens for the
    /// given Series without including any trade fees
    /// @notice The premium depends on the amount of collateral token in the pool, the reserves
    /// of bToken and wToken in the pool, and the current series price of the underlying
    /// @param seriesId The ID of the Series to buy bToken on
    /// @param bTokenAmount The amount of bToken to buy, which uses the same decimals as
    /// the underlying ERC20 token
    /// @return The amount of collateral token necessary to buy bTokenAmount worth of bTokens
    function bTokenGetCollateralInWithoutFees(
        uint64 seriesId,
        uint256 bTokenAmount,
        uint256 bTokenPrice
    ) public view returns (uint256) {
        return
            AmmDataProvider.bTokenGetCollateralIn(
                refs,
                seriesId,
                address(this),
                bTokenAmount,
                collateralToken.balanceOf(address(this)),
                bTokenPrice
            );
    }

    /// @notice Calculate premium (i.e. the option price) to buy bTokenAmount bTokens for the
    /// given Series
    /// @notice The premium depends on the amount of collateral token in the pool, the reserves
    /// of bToken and wToken in the pool, and the current series price of the underlying
    /// @param seriesId The ID of the Series to buy bToken on
    /// @param bTokenAmount The amount of bToken to buy, which uses the same decimals as
    /// the underlying ERC20 token
    /// @return The amount of collateral token necessary to buy bTokenAmount worth of bTokens
    /// NOTE: This returns the collateral + fee amount
    function bTokenGetCollateralIn(uint64 seriesId, uint256 bTokenAmount)
        public
        view
        returns (uint256)
    {
        uint256 collateralWithoutFees = bTokenGetCollateralInWithoutFees(
            seriesId,
            bTokenAmount,
            getPriceForSeries(seriesId)
        );
        uint256 tradeFee = AmmDataProvider.calculateFees(
            bTokenAmount,
            collateralWithoutFees,
            tradeFeeBasisPoints,
            maxOptionFeeBasisPoints,
            feeDestinationAddress
        );
        return collateralWithoutFees + tradeFee;
    }

    /// @notice Calculate the amount of collateral token the user will receive for selling
    /// bTokenAmount worth of bToken to the pool. This is the option's sell price without
    /// including any trade fees
    /// @notice The sell price depends on the amount of collateral token in the pool, the reserves
    /// of bToken and wToken in the pool, and the current series price of the underlying
    /// @param seriesId The ID of the Series to sell bToken on
    /// @param bTokenAmount The amount of bToken to sell, which uses the same decimals as
    /// the underlying ERC20 token
    /// @return The amount of collateral token the user will receive upon selling bTokenAmount of
    /// bTokens to the pool
    function bTokenGetCollateralOutWithoutFees(
        uint64 seriesId,
        uint256 bTokenAmount,
        uint256 bTokenPrice
    ) public view returns (uint256) {
        return
            optionTokenGetCollateralOutInternal(
                seriesId,
                bTokenAmount,
                collateralToken.balanceOf(address(this)),
                bTokenPrice,
                true
            );
    }

    /// @notice Calculate the amount of collateral token the user will receive for selling
    /// bTokenAmount worth of bToken to the pool. This is the option's sell price
    /// @notice The sell price depends on the amount of collateral token in the pool, the reserves
    /// of bToken and wToken in the pool, and the current series price of the underlying
    /// @param seriesId The ID of the Series to sell bToken on
    /// @param bTokenAmount The amount of bToken to sell, which uses the same decimals as
    /// the underlying ERC20 token
    /// @return The amount of collateral token the user will receive upon selling bTokenAmount of
    /// bTokens to the pool minus any trade fees
    /// NOTE: This returns the collateral - fee amount
    function bTokenGetCollateralOut(uint64 seriesId, uint256 bTokenAmount)
        public
        view
        returns (uint256)
    {
        uint256 collateralWithoutFees = optionTokenGetCollateralOutInternal(
            seriesId,
            bTokenAmount,
            collateralToken.balanceOf(address(this)),
            getPriceForSeries(seriesId),
            true
        );
        uint256 tradeFee = AmmDataProvider.calculateFees(
            bTokenAmount,
            collateralWithoutFees,
            tradeFeeBasisPoints,
            maxOptionFeeBasisPoints,
            feeDestinationAddress
        );
        return collateralWithoutFees - tradeFee;
    }

    /// @notice Sell the wToken of a given series to the AMM in exchange for collateral token
    /// @param seriesId The ID of the Series to buy wToken on
    /// @param wTokenAmount The amount of wToken to sell (wToken has the same decimals as the underlying)
    /// @param collateralMinimum The lowest amount of collateral the caller is willing to receive as payment
    /// for their wToken. The actual amount of wToken received may be lower than this due to slippage
    function wTokenSell(
        uint64 seriesId,
        uint256 wTokenAmount,
        uint256 collateralMinimum
    ) external minTradeSize(wTokenAmount) nonReentrant returns (uint256) {
        require(openSeries.contains(seriesId), "E13");

        require(
            seriesController.state(seriesId) ==
                ISeriesController.SeriesState.OPEN,
            "Series has expired"
        );

        // Get initial stats
        uint256 collateralAmount = wTokenGetCollateralOut(
            seriesId,
            wTokenAmount
        );
        require(collateralAmount >= collateralMinimum, "Slippage exceeded");

        AmmDataProvider.executeWTokenSell(
            refs,
            seriesId,
            wTokenAmount,
            collateralAmount,
            collateralToken
        );
        // Emit the event
        emit WTokensSold(msg.sender, seriesId, wTokenAmount, collateralAmount);

        // Return the amount of collateral received during sale
        return collateralAmount;
    }

    /// @notice Calculate amount of collateral in exchange for selling wTokens
    function wTokenGetCollateralOut(uint64 seriesId, uint256 wTokenAmount)
        public
        view
        returns (uint256)
    {
        return
            optionTokenGetCollateralOutInternal(
                seriesId,
                wTokenAmount,
                collateralToken.balanceOf(address(this)),
                getPriceForSeries(seriesId),
                false
            );
    }

    /// @dev Calculates the amount of collateral token a seller will receive for selling their option tokens,
    /// taking into account the AMM's level of reserves
    /// @param seriesId The ID of the Series
    /// @param optionTokenAmount The amount of option tokens (either bToken or wToken) to be sold
    /// @param _collateralTokenBalance The amount of collateral token held by this AMM
    /// @param isBToken true if the option token is bToken, and false if it's wToken. Depending on which
    /// of the two it is, the equation for calculating the final collateral token is a little different
    /// @return The amount of collateral token the seller will receive in exchange for their option token
    function optionTokenGetCollateralOutInternal(
        uint64 seriesId,
        uint256 optionTokenAmount,
        uint256 _collateralTokenBalance,
        uint256 bTokenPrice,
        bool isBToken
    ) private view returns (uint256) {
        return
            AmmDataProvider.optionTokenGetCollateralOut(
                refs,
                seriesId,
                address(this),
                optionTokenAmount,
                _collateralTokenBalance,
                bTokenPrice,
                isBToken
            );
    }

    /// @notice Calculate the amount of collateral the AMM would received if all of the
    /// expired Series' wTokens and bTokens were to be redeemed for their underlying collateral
    /// value
    /// @return The amount of collateral token the AMM would receive if it were to exercise/claim
    /// all expired bTokens/wTokens
    function getCollateralValueOfAllExpiredOptionTokens()
        public
        view
        returns (uint256)
    {
        return
            AmmDataProvider.getCollateralValueOfAllExpiredOptionTokens(
                refs,
                getAllSeries(),
                address(this)
            );
    }

    /// @notice Calculate sale value of pro-rata LP b/wTokens in units of collateral token
    function getOptionTokensSaleValue(uint256 lpTokenAmount)
        external
        view
        returns (uint256)
    {
        uint256 lpTokenSupply = IERC20Lib(address(lpToken)).totalSupply();

        return
            AmmDataProvider.getOptionTokensSaleValue(
                refs,
                lpTokenAmount,
                lpTokenSupply,
                getAllSeries(),
                address(this),
                collateralToken.balanceOf(address(this)),
                getAllVolatilities()
            );
    }

    /// @notice Adds the address of series to the amm
    /// @dev Only the associated SeriesController may call this function
    /// @dev The SeriesController calls this function when it is creating a Series
    /// and adds the Series to this AMM
    function addSeries(uint64 _seriesId) external override {
        require(msg.sender == address(seriesController), "E11");
        // Prevents out of gas error, occuring at 250 series, from locking
        // in LPs when we cycle over openSeries in _sellOrWithdrawActiveTokens.
        // We further lower the limit to 100 series for extra safety.
        require(openSeries.length() <= 100, "Too many open series");
        openSeries.add(_seriesId);
    }

    /// @notice Returns true when interfaceId is the ID of the addSeries function or the ERC165
    /// standard, and false otherwise
    /// @dev This function exists only so the SeriesController can tell when to try to add
    /// Series it has created to the MinterAmm
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override
        returns (bool)
    {
        return
            interfaceId == this.addSeries.selector ||
            super.supportsInterface(interfaceId);
    }

    function calculatePriceAndVega(uint64 seriesId)
        internal
        returns (uint256 price, uint256 vega)
    {
        ISeriesController.Series memory series = seriesController.series(
            seriesId
        );
        IBlackScholes blackScholes = IBlackScholes(
            addressesProvider.getBlackScholes()
        );

        IBlackScholes.PricesStdVega memory pricesStdVega = blackScholes
            .pricesStdVegaInUnderlying(
                series.expirationDate - block.timestamp,
                getVolatility(seriesId),
                getCurrentUnderlyingPrice(),
                series.strikePrice,
                0,
                series.isPutOption
            );
        return (pricesStdVega.price, pricesStdVega.stdVega);
    }
}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../token/ISimpleToken.sol";
import "../series/ISeriesController.sol";
import "../series/IPriceOracle.sol";
import "../series/SeriesLibrary.sol";
import "../libraries/Math.sol";
import "./IBlackScholes.sol";
import "../configuration/IAddressesProvider.sol";
import "../swap/ILight.sol";

library AmmDataProvider {
    using SafeERC20 for IERC20;

    struct References {
        IERC1155 erc1155Controller;
        ISeriesController seriesController;
        IPriceOracle priceOracle;
        IAddressesProvider addressesProvider;
    }

    // Emitted when fees are paid
    event TradeFeesPaid(address indexed feePaidTo, uint256 feeAmount);

    /// This function determines reserves of a bonding curve for a specific series.
    /// Given price of bToken we determine what is the largest pool we can create such that
    /// the ratio of its reserves satisfy the given bToken price: Rb / Rw = (1 - Pb) / Pb
    function getVirtualReserves(
        References storage refs,
        uint64 seriesId,
        address ammAddress,
        uint256 collateralTokenBalance,
        uint256 bTokenPrice
    ) public view returns (uint256, uint256) {
        uint256 bTokenIndex = SeriesLibrary.bTokenIndex(seriesId);
        uint256 wTokenIndex = SeriesLibrary.wTokenIndex(seriesId);

        // Get residual balances
        uint256 bTokenBalance = refs.erc1155Controller.balanceOf(
            ammAddress,
            bTokenIndex
        );
        uint256 wTokenBalance = refs.erc1155Controller.balanceOf(
            ammAddress,
            wTokenIndex
        );

        ISeriesController.Series memory series = refs.seriesController.series(
            seriesId
        );

        // For put convert token balances into collateral locked in them
        if (series.isPutOption) {
            bTokenBalance = refs.seriesController.getCollateralPerOptionToken(
                seriesId,
                bTokenBalance
            );
            wTokenBalance = refs.seriesController.getCollateralPerOptionToken(
                seriesId,
                wTokenBalance
            );
        }

        // Max amount of tokens we can get by adding current balance plus what can be minted from collateral
        uint256 bTokenBalanceMax = bTokenBalance + collateralTokenBalance;
        uint256 wTokenBalanceMax = wTokenBalance + collateralTokenBalance;

        uint256 wTokenPrice = uint256(1e18) - bTokenPrice;

        // Balance on higher reserve side is the sum of what can be minted (collateralTokenBalance)
        // plus existing balance of the token
        uint256 bTokenVirtualBalance;
        uint256 wTokenVirtualBalance;

        if (bTokenPrice <= wTokenPrice) {
            // Rb >= Rw, Pb <= Pw
            bTokenVirtualBalance = bTokenBalanceMax;
            wTokenVirtualBalance =
                (bTokenVirtualBalance * bTokenPrice) /
                wTokenPrice;

            // Sanity check that we don't exceed actual physical balances
            // In case this happens, adjust virtual balances to not exceed maximum
            // available reserves while still preserving correct price
            if (wTokenVirtualBalance > wTokenBalanceMax) {
                wTokenVirtualBalance = wTokenBalanceMax;
                bTokenVirtualBalance =
                    (wTokenVirtualBalance * wTokenPrice) /
                    bTokenPrice;
            }
        } else {
            // if Rb < Rw, Pb > Pw
            wTokenVirtualBalance = wTokenBalanceMax;
            bTokenVirtualBalance =
                (wTokenVirtualBalance * wTokenPrice) /
                bTokenPrice;

            // Sanity check
            if (bTokenVirtualBalance > bTokenBalanceMax) {
                bTokenVirtualBalance = bTokenBalanceMax;
                wTokenVirtualBalance =
                    (bTokenVirtualBalance * bTokenPrice) /
                    wTokenPrice;
            }
        }

        return (bTokenVirtualBalance, wTokenVirtualBalance);
    }

    /// @notice Calculate premium (i.e. the option price) to buy bTokenAmount bTokens for the
    /// given Series
    /// @notice The premium depends on the amount of collateral token in the pool, the reserves
    /// of bToken and wToken in the pool, and the current series price of the underlying
    /// @param seriesId The ID of the Series to buy bToken on
    /// @param ammAddress The AMM whose reserves we'll use
    /// @param bTokenAmount The amount of bToken to buy, which uses the same decimals as
    /// the underlying ERC20 token
    /// @return The amount of collateral token necessary to buy bTokenAmount worth of bTokens
    function bTokenGetCollateralIn(
        References storage refs,
        uint64 seriesId,
        address ammAddress,
        uint256 bTokenAmount,
        uint256 collateralTokenBalance,
        uint256 bTokenPrice
    ) external view returns (uint256) {
        // Shortcut for 0 amount
        if (bTokenAmount == 0) return 0;

        bTokenAmount = refs.seriesController.getCollateralPerOptionToken(
            seriesId,
            bTokenAmount
        );

        // For both puts and calls balances are expressed in collateral token
        (uint256 bTokenBalance, uint256 wTokenBalance) = getVirtualReserves(
            refs,
            seriesId,
            ammAddress,
            collateralTokenBalance,
            bTokenPrice
        );

        uint256 sumBalance = bTokenBalance + wTokenBalance;
        uint256 toSquare;
        if (sumBalance > bTokenAmount) {
            toSquare = sumBalance - bTokenAmount;
        } else {
            toSquare = bTokenAmount - sumBalance;
        }

        // return the collateral amount
        return
            (((Math.sqrt((toSquare**2) + (4 * bTokenAmount * wTokenBalance)) +
                bTokenAmount) - bTokenBalance) - wTokenBalance) / 2;
    }

    /// @dev Calculates the amount of collateral token a seller will receive for selling their option tokens,
    /// taking into account the AMM's level of reserves
    /// @param seriesId The ID of the Series
    /// @param ammAddress The AMM whose reserves we'll use
    /// @param optionTokenAmount The amount of option tokens (either bToken or wToken) to be sold
    /// @param collateralTokenBalance The amount of collateral token held by this AMM
    /// @param bTokenPrice The price of 1 (human readable unit) bToken for this series, in units of collateral token
    /// @param isBToken true if the option token is bToken, and false if it's wToken. Depending on which
    /// of the two it is, the equation for calculating the final collateral token is a little different
    /// @return The amount of collateral token the seller will receive in exchange for their option token
    function optionTokenGetCollateralOut(
        References storage refs,
        uint64 seriesId,
        address ammAddress,
        uint256 optionTokenAmount,
        uint256 collateralTokenBalance,
        uint256 bTokenPrice,
        bool isBToken
    ) public view returns (uint256) {
        // Shortcut for 0 amount
        if (optionTokenAmount == 0) return 0;

        optionTokenAmount = refs.seriesController.getCollateralPerOptionToken(
            seriesId,
            optionTokenAmount
        );

        (uint256 bTokenBalance, uint256 wTokenBalance) = getVirtualReserves(
            refs,
            seriesId,
            ammAddress,
            collateralTokenBalance,
            bTokenPrice
        );

        uint256 balanceFactor;
        if (isBToken) {
            balanceFactor = wTokenBalance;
        } else {
            balanceFactor = bTokenBalance;
        }
        uint256 toSquare = optionTokenAmount + wTokenBalance + bTokenBalance;
        uint256 collateralAmount = (toSquare -
            Math.sqrt(
                (toSquare**2) - (4 * optionTokenAmount * balanceFactor)
            )) / 2;

        return collateralAmount;
    }

    /// @dev Calculate the collateral amount receivable by redeeming the given
    /// Series' bTokens and wToken
    /// @param seriesId The index of the Series
    /// @param wTokenBalance The wToken balance for this Series owned by this AMM
    /// @param bTokenBalance The bToken balance for this Series owned by this AMM
    /// @return The total amount of collateral receivable by redeeming the Series' option tokens
    function getRedeemableCollateral(
        References storage refs,
        uint64 seriesId,
        uint256 wTokenBalance,
        uint256 bTokenBalance
    ) public view returns (uint256) {
        uint256 unredeemedCollateral = 0;
        if (wTokenBalance > 0) {
            (uint256 unclaimedCollateral, ) = refs
                .seriesController
                .getClaimAmount(seriesId, wTokenBalance);
            unredeemedCollateral += unclaimedCollateral;
        }
        if (bTokenBalance > 0) {
            (uint256 unexercisedCollateral, ) = refs
                .seriesController
                .getExerciseAmount(seriesId, bTokenBalance);
            unredeemedCollateral += unexercisedCollateral;
        }

        return unredeemedCollateral;
    }

    /// @notice Calculate the amount of collateral the AMM would received if all of the
    /// expired Series' wTokens and bTokens were to be redeemed for their underlying collateral
    /// value
    /// @return The amount of collateral token the AMM would receive if it were to exercise/claim
    /// all expired bTokens/wTokens
    function getCollateralValueOfAllExpiredOptionTokens(
        References storage refs,
        uint64[] memory openSeries,
        address ammAddress
    ) public view returns (uint256) {
        uint256 unredeemedCollateral = 0;

        for (uint256 i = 0; i < openSeries.length; i++) {
            uint64 seriesId = openSeries[i];

            if (
                refs.seriesController.state(seriesId) ==
                ISeriesController.SeriesState.EXPIRED
            ) {
                uint256 bTokenIndex = SeriesLibrary.bTokenIndex(seriesId);
                uint256 wTokenIndex = SeriesLibrary.wTokenIndex(seriesId);

                // Get the pool's option token balances
                uint256 bTokenBalance = refs.erc1155Controller.balanceOf(
                    ammAddress,
                    bTokenIndex
                );
                uint256 wTokenBalance = refs.erc1155Controller.balanceOf(
                    ammAddress,
                    wTokenIndex
                );

                // calculate the amount of collateral The AMM would receive by
                // redeeming this Series' bTokens and wTokens
                unredeemedCollateral += getRedeemableCollateral(
                    refs,
                    seriesId,
                    wTokenBalance,
                    bTokenBalance
                );
            }
        }

        return unredeemedCollateral;
    }

    /// @dev - memory struct used to get around stack too deep issues
    struct SaleValueInfo {
        uint256 expiredOptionTokenCollateral;
        uint256 totalCollateral;
        uint256 collateralLeft;
        uint64 seriesId;
    }

    /// @notice Calculate sale value of pro-rata LP b/wTokens in units of collateral token
    function getOptionTokensSaleValue(
        References storage refs,
        uint256 lpTokenAmount,
        uint256 lpTokenSupply,
        uint64[] memory openSeries,
        address ammAddress,
        uint256 collateralTokenBalance,
        uint256[] memory impliedVolatility
    ) external view returns (uint256) {
        if (lpTokenAmount == 0) return 0;
        if (lpTokenSupply == 0) return 0;

        SaleValueInfo memory info;

        // Calculate the amount of collateral receivable by redeeming all the expired option tokens
        info
            .expiredOptionTokenCollateral = getCollateralValueOfAllExpiredOptionTokens(
            refs,
            openSeries,
            ammAddress
        );

        // Calculate amount of collateral left in the pool to sell tokens to
        info.totalCollateral =
            info.expiredOptionTokenCollateral +
            collateralTokenBalance;

        // Subtract pro-rata collateral amount to be withdrawn
        info.totalCollateral =
            (info.totalCollateral * (lpTokenSupply - lpTokenAmount)) /
            lpTokenSupply;

        // Given remaining collateral calculate how much all tokens can be sold for
        info.collateralLeft = info.totalCollateral;
        for (uint256 i = 0; i < openSeries.length; i++) {
            info.seriesId = openSeries[i];

            if (
                refs.seriesController.state(info.seriesId) ==
                ISeriesController.SeriesState.OPEN
            ) {
                uint256 bTokenToSell = (refs.erc1155Controller.balanceOf(
                    ammAddress,
                    SeriesLibrary.bTokenIndex(info.seriesId)
                ) * lpTokenAmount) / lpTokenSupply;
                uint256 wTokenToSell = (refs.erc1155Controller.balanceOf(
                    ammAddress,
                    SeriesLibrary.wTokenIndex(info.seriesId)
                ) * lpTokenAmount) / lpTokenSupply;

                uint256 bTokenPrice = getPriceForExpiredSeries(
                    refs,
                    info.seriesId,
                    impliedVolatility[i]
                );

                uint256 collateralAmountB = optionTokenGetCollateralOut(
                    refs,
                    info.seriesId,
                    ammAddress,
                    bTokenToSell,
                    info.collateralLeft,
                    bTokenPrice,
                    true
                );
                info.collateralLeft -= collateralAmountB;

                uint256 collateralAmountW = optionTokenGetCollateralOut(
                    refs,
                    info.seriesId,
                    ammAddress,
                    wTokenToSell,
                    info.collateralLeft,
                    bTokenPrice,
                    false
                );
                info.collateralLeft -= collateralAmountW;
            }
        }

        return info.totalCollateral - info.collateralLeft;
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
    /// @dev This function assumes that it will only be called on an OPEN Series; if the
    /// Series is EXPIRED, then the expirationDate - block.timestamp will throw an underflow error
    function getPriceForExpiredSeries(
        References storage refs,
        uint64 seriesId,
        uint256 volatilityFactor
    ) public view returns (uint256) {
        ISeriesController.Series memory series = refs.seriesController.series(
            seriesId
        );
        uint256 underlyingPrice = IPriceOracle(refs.priceOracle)
            .getCurrentPrice(
                refs.seriesController.underlyingToken(seriesId),
                refs.seriesController.priceToken(seriesId)
            );

        return
            getPriceForExpiredSeriesInternal(
                refs,
                series,
                underlyingPrice,
                volatilityFactor
            );
    }

    function getPriceForExpiredSeriesInternal(
        References storage refs,
        ISeriesController.Series memory series,
        uint256 underlyingPrice,
        uint256 volatilityFactor
    ) private view returns (uint256) {
        // Note! This function assumes the underlyingPrice is a valid series
        // price in units of underlyingToken/priceToken. If the onchain price
        // oracle's value were to drift from the true series price, then the bToken price
        // we calculate here would also drift, and will result in undefined
        // behavior for any functions which call getPriceForExpiredSeriesInternal
        (uint256 call, uint256 put) = IBlackScholes(
            refs.addressesProvider.getBlackScholes()
        ).optionPrices(
                series.expirationDate - block.timestamp,
                volatilityFactor,
                underlyingPrice,
                series.strikePrice,
                0
            );
        if (series.isPutOption == true) {
            return ((put * 1e18) / underlyingPrice);
        } else {
            return ((call * 1e18) / underlyingPrice);
        }
    }

    /// @dev used to get around stack too deep issues with too many variables
    struct PoolValueInfo {
        uint256 underlyingPrice;
        uint256 activeTokensValue;
        uint256 expiredTokensValue;
        uint64 seriesId;
    }

    /// Get value of all assets in the pool in units of this AMM's collateralToken.
    /// Can specify whether to include the value of expired unclaimed tokens
    function getTotalPoolValue(
        References storage refs,
        bool includeUnclaimed,
        uint64[] memory openSeries,
        uint256 collateralBalance,
        address ammAddress,
        uint256[] memory impliedVolatility
    ) external view returns (uint256) {
        // Note! This function assumes the underlyingPrice is a valid series
        // price in units of underlyingToken/priceToken. If the onchain price
        // oracle's value were to drift from the true series price, then the bToken price
        // we calculate here would also drift, and will result in undefined
        // behavior for any functions which call getTotalPoolValue
        PoolValueInfo memory info;

        if (openSeries.length > 0) {
            // we assume the openSeries are all from the same AMM, and thus all its Series
            // use the same underlying and price tokens, so we can arbitrarily choose the first
            // when fetching the necessary token addresses
            info.underlyingPrice = IPriceOracle(refs.priceOracle)
                .getCurrentPrice(
                    refs.seriesController.underlyingToken(openSeries[0]),
                    refs.seriesController.priceToken(openSeries[0])
                );
        }

        // First, determine the value of all residual b/wTokens
        for (uint256 i = 0; i < openSeries.length; i++) {
            info.seriesId = openSeries[i];
            ISeriesController.Series memory series = refs
                .seriesController
                .series(info.seriesId);

            uint256 bTokenBalance = refs.erc1155Controller.balanceOf(
                ammAddress,
                SeriesLibrary.bTokenIndex(info.seriesId)
            );
            uint256 wTokenBalance = refs.erc1155Controller.balanceOf(
                ammAddress,
                SeriesLibrary.wTokenIndex(info.seriesId)
            );

            if (
                refs.seriesController.state(info.seriesId) ==
                ISeriesController.SeriesState.OPEN
            ) {
                // value all active bTokens and wTokens at current prices
                uint256 bPrice = getPriceForExpiredSeriesInternal(
                    refs,
                    series,
                    info.underlyingPrice,
                    impliedVolatility[i]
                );
                // wPrice = 1 - bPrice
                uint256 wPrice = uint256(1e18) - bPrice;

                uint256 tokensValueCollateral = refs
                    .seriesController
                    .getCollateralPerOptionToken(
                        info.seriesId,
                        (bTokenBalance * bPrice + wTokenBalance * wPrice) / 1e18
                    );

                info.activeTokensValue += tokensValueCollateral;
            } else if (
                includeUnclaimed &&
                refs.seriesController.state(info.seriesId) ==
                ISeriesController.SeriesState.EXPIRED
            ) {
                // Get collateral token locked in the series
                info.expiredTokensValue += getRedeemableCollateral(
                    refs,
                    info.seriesId,
                    wTokenBalance,
                    bTokenBalance
                );
            }
        }

        // Add value of OPEN Series, EXPIRED Series, and collateral token
        return
            info.activeTokensValue +
            info.expiredTokensValue +
            collateralBalance;
    }

    /// @dev Calculate the fee amount for a buy/sell
    /// If params are not set, the fee amount will be 0
    /// See contract comments above for logic explanation of fee calculations.
    function calculateFees(
        uint256 bTokenAmount,
        uint256 collateralAmount,
        uint16 tradeFeeBasisPoints,
        uint16 maxOptionFeeBasisPoints,
        address feeDestinationAddress
    ) public pure returns (uint256) {
        // Check if fees are enabled
        if (
            tradeFeeBasisPoints > 0 &&
            maxOptionFeeBasisPoints > 0 &&
            feeDestinationAddress != address(0x0)
        ) {
            uint256 tradeFee = 0;

            // The default fee is the basis points of the number of options being bought (e.g. bToken amount)
            uint256 defaultFee = (bTokenAmount * tradeFeeBasisPoints) / 10_000;

            // The max fee is based on the maximum percentage of the collateral being paid to buy the options
            uint256 maxFee = (collateralAmount * maxOptionFeeBasisPoints) /
                10_000;

            // Use the smaller of the 2
            if (defaultFee < maxFee) {
                tradeFee = defaultFee;
            } else {
                tradeFee = maxFee;
            }

            return tradeFee;
        }

        // Fees are not enabled
        return 0;
    }

    /// @notice Sell the wToken of a given series to the AMM in exchange for collateral token
    /// @param seriesId The ID of the Series to buy wToken on
    /// @param wTokenAmount The amount of wToken to sell (wToken has the same decimals as the underlying)
    /// @param collateralAmount The amount of collateral the caller is willing to receive as payment
    /// @param collateralToken Token contract being traded for wTokens
    /// for their wToken. The actual amount of wToken received may be lower than this due to slippage
    function executeWTokenSell(
        References storage refs,
        uint64 seriesId,
        uint256 wTokenAmount,
        uint256 collateralAmount,
        IERC20 collateralToken
    ) external returns (uint256) {
        uint256 bTokenIndex = SeriesLibrary.bTokenIndex(seriesId);
        uint256 wTokenIndex = SeriesLibrary.wTokenIndex(seriesId);

        // Move wToken into this contract
        bytes memory data;
        refs.erc1155Controller.safeTransferFrom(
            msg.sender,
            address(this),
            wTokenIndex,
            wTokenAmount,
            data
        );

        // Always be closing!
        uint256 bTokenBalance = refs.erc1155Controller.balanceOf(
            address(this),
            bTokenIndex
        );
        uint256 wTokenBalance = refs.erc1155Controller.balanceOf(
            address(this),
            wTokenIndex
        );
        uint256 closeAmount = Math.min(bTokenBalance, wTokenBalance);
        if (closeAmount > 0) {
            refs.seriesController.closePosition(seriesId, closeAmount);
        }

        // Send the tokens to the seller
        collateralToken.safeTransfer(msg.sender, collateralAmount);

        // Return the amount of collateral received during sale
        return collateralAmount;
    }

    struct DirectBuyInfo {
        uint64 seriesId;
        uint256 nonce; // Nonce on the airswap sig for the signer
        uint256 expiry; // Date until swap is valid
        address signerWallet; // Address of the buyer (signer)
        uint256 signerAmount; // Amount of collateral that will be paid for options by the signer
        uint256 senderAmount; // Amount of options to buy from the AMM
        uint8 v; // Sig of signer wallet for Airswap
        bytes32 r; // Sig of signer wallet for Airswap
        bytes32 s; // Sig of signer wallet for Airswap
        IERC20 collateralToken;
        address lightAirswapAddress;
        uint16 tradeFeeBasisPoints;
        uint16 maxOptionFeeBasisPoints;
        address feeDestinationAddress;
    }

    /// @dev Allows an owner to invoke a Direct Buy against the AMM
    /// A direct buy allows a signer wallet to predetermine a number of option
    ///     tokens to buy (senderAmount) with the specified number of collateral payment tokens (signerTokens).
    /// The direct buy will first use the collateral in the AMM to mint the options and
    ///     then execute a swap with the signer using Airswap protocol.
    /// Only the owner should be allowed to execute a direct buy as this is a "guarded" call.
    /// Sender address in the Airswap protocol will be this contract address.
    function executeBTokenDirectBuy(
        References storage refs,
        DirectBuyInfo memory buyInfo
    ) external {
        // Get the bToken balance of the AMM
        uint256 bTokenIndex = SeriesLibrary.bTokenIndex(buyInfo.seriesId);
        uint256 bTokenBalance = refs.erc1155Controller.balanceOf(
            address(this),
            bTokenIndex
        );

        // Mint required number of bTokens for the direct buy (if required)
        if (bTokenBalance < buyInfo.senderAmount) {
            // Approve the collateral to mint bTokenAmount of new options
            uint256 bTokenCollateralAmount = refs
                .seriesController
                .getCollateralPerOptionToken(
                    buyInfo.seriesId,
                    buyInfo.senderAmount - bTokenBalance
                );

            buyInfo.collateralToken.approve(
                address(refs.seriesController),
                bTokenCollateralAmount
            );

            // If the AMM does not have enough collateral to mint tokens, expect revert.
            refs.seriesController.mintOptions(
                buyInfo.seriesId,
                buyInfo.senderAmount - bTokenBalance
            );
        }

        // Approve the bTokens to be swapped
        refs.erc1155Controller.setApprovalForAll(
            buyInfo.lightAirswapAddress,
            true
        );

        // Now that the contract has enough bTokens, swap with the buyer
        ILight(buyInfo.lightAirswapAddress).swap(
            buyInfo.nonce, // Signer's nonce
            buyInfo.expiry, // Expiration date of swap
            buyInfo.signerWallet, // Buyer of the options
            address(buyInfo.collateralToken), // Payment made by buyer
            buyInfo.signerAmount, // Amount of collateral paid for options
            address(refs.erc1155Controller), // Address of erc1155 contract
            bTokenIndex, // Token ID for options
            buyInfo.senderAmount, // Num options to sell
            buyInfo.v,
            buyInfo.r,
            buyInfo.s
        ); // Sig of signer for swap

        // Remove approval
        refs.erc1155Controller.setApprovalForAll(
            buyInfo.lightAirswapAddress,
            false
        );

        // Calculate trade fees if they are enabled with all params set
        uint256 tradeFee = calculateFees(
            buyInfo.senderAmount,
            buyInfo.signerAmount,
            buyInfo.tradeFeeBasisPoints,
            buyInfo.maxOptionFeeBasisPoints,
            buyInfo.feeDestinationAddress
        );

        // If fees were taken, move them to the destination
        if (tradeFee > 0) {
            buyInfo.collateralToken.safeTransfer(
                buyInfo.feeDestinationAddress,
                tradeFee
            );
            emit TradeFeesPaid(buyInfo.feeDestinationAddress, tradeFee);
        }
    }

    struct BTokenBuyInfo {
        uint64 seriesId;
        uint256 bTokenAmount;
        uint256 collateralMaximum;
        uint256 collateralAmount;
        IERC20 collateralToken;
        uint16 tradeFeeBasisPoints;
        uint16 maxOptionFeeBasisPoints;
        address feeDestinationAddress;
    }

    /// @dev Buy bToken of a given series.
    /// We supply series index instead of series address to ensure that only supported series can be traded using this AMM
    /// collateralMaximum is used for slippage protection.
    /// @notice Trade fees are added to the collateral amount moved from the buyer's account to pay for the bToken
    function executeBTokenBuy(
        References storage refs,
        BTokenBuyInfo memory buyInfo
    ) external returns (uint256) {
        // Calculate trade fees if they are enabled with all params set
        uint256 tradeFee = calculateFees(
            buyInfo.bTokenAmount,
            buyInfo.collateralAmount,
            buyInfo.tradeFeeBasisPoints,
            buyInfo.maxOptionFeeBasisPoints,
            buyInfo.feeDestinationAddress
        );

        require(
            buyInfo.collateralAmount + tradeFee <= buyInfo.collateralMaximum,
            "Slippage exceeded"
        );

        // Move collateral into this contract
        buyInfo.collateralToken.safeTransferFrom(
            msg.sender,
            address(this),
            buyInfo.collateralAmount + tradeFee
        );

        // If fees were taken, move them to the destination
        if (tradeFee > 0) {
            buyInfo.collateralToken.safeTransfer(
                buyInfo.feeDestinationAddress,
                tradeFee
            );
            emit TradeFeesPaid(buyInfo.feeDestinationAddress, tradeFee);
        }

        // Mint new options only as needed
        uint256 bTokenIndex = SeriesLibrary.bTokenIndex(buyInfo.seriesId);
        uint256 bTokenBalance = refs.erc1155Controller.balanceOf(
            address(this),
            bTokenIndex
        );
        if (bTokenBalance < buyInfo.bTokenAmount) {
            // Approve the collateral to mint bTokenAmount of new options
            uint256 bTokenCollateralAmount = refs
                .seriesController
                .getCollateralPerOptionToken(
                    buyInfo.seriesId,
                    buyInfo.bTokenAmount - bTokenBalance
                );

            buyInfo.collateralToken.approve(
                address(refs.seriesController),
                bTokenCollateralAmount
            );
            refs.seriesController.mintOptions(
                buyInfo.seriesId,
                buyInfo.bTokenAmount - bTokenBalance
            );
        }

        // Send all bTokens back
        bytes memory data;
        refs.erc1155Controller.safeTransferFrom(
            address(this),
            msg.sender,
            bTokenIndex,
            buyInfo.bTokenAmount,
            data
        );

        // Return the amount of collateral required to buy
        return buyInfo.collateralAmount + tradeFee;
    }

    struct BTokenSellInfo {
        uint64 seriesId;
        uint256 bTokenAmount;
        uint256 collateralMinimum;
        uint256 collateralAmount;
        IERC20 collateralToken;
        uint16 tradeFeeBasisPoints;
        uint16 maxOptionFeeBasisPoints;
        address feeDestinationAddress;
    }

    /// @notice Sell the bToken of a given series to the AMM in exchange for collateral token
    /// @notice This call will fail if the caller tries to sell a bToken amount larger than the amount of
    /// wToken held by the AMM
    /// @notice Trade fees are subracted from the collateral amount moved to the seller's account in exchange for bTokens
    /// for their bToken. The actual amount of bToken received may be lower than this due to slippage
    function executeBTokenSell(
        References storage refs,
        BTokenSellInfo memory buyInfo
    ) external returns (uint256) {
        // Calculate trade fees if they are enabled with all params set
        uint256 tradeFee = calculateFees(
            buyInfo.bTokenAmount,
            buyInfo.collateralAmount,
            buyInfo.tradeFeeBasisPoints,
            buyInfo.maxOptionFeeBasisPoints,
            buyInfo.feeDestinationAddress
        );

        require(
            buyInfo.collateralAmount - tradeFee >= buyInfo.collateralMinimum,
            "Slippage exceeded"
        );

        uint256 bTokenIndex = SeriesLibrary.bTokenIndex(buyInfo.seriesId);
        uint256 wTokenIndex = SeriesLibrary.wTokenIndex(buyInfo.seriesId);

        // Move bToken into this contract
        bytes memory data;
        refs.erc1155Controller.safeTransferFrom(
            msg.sender,
            address(this),
            bTokenIndex,
            buyInfo.bTokenAmount,
            data
        );

        // Always be closing!
        uint256 bTokenBalance = refs.erc1155Controller.balanceOf(
            address(this),
            bTokenIndex
        );
        uint256 wTokenBalance = refs.erc1155Controller.balanceOf(
            address(this),
            wTokenIndex
        );
        uint256 closeAmount = Math.min(bTokenBalance, wTokenBalance);

        // at this point we know it's worth calling closePosition because
        // the close amount is greater than 0, so let's call it and burn
        // excess option tokens in order to receive collateral tokens
        refs.seriesController.closePosition(buyInfo.seriesId, closeAmount);

        // Send the tokens to the seller
        buyInfo.collateralToken.safeTransfer(
            msg.sender,
            buyInfo.collateralAmount - tradeFee
        );

        // If fees were taken, move them to the destination
        if (tradeFee > 0) {
            buyInfo.collateralToken.safeTransfer(
                buyInfo.feeDestinationAddress,
                tradeFee
            );
            emit TradeFeesPaid(buyInfo.feeDestinationAddress, tradeFee);
        }

        // Return the amount of collateral received during sale
        return buyInfo.collateralAmount - tradeFee;
    }
}

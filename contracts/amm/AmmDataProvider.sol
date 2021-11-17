// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../token/ISimpleToken.sol";
import "../series/ISeriesController.sol";
import "../series/IPriceOracle.sol";
import "../series/SeriesLibrary.sol";
import "../libraries/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library AmmDataProvider {
    struct References {
        IERC1155 erc1155Controller;
        ISeriesController seriesController;
        IPriceOracle priceOracle;
    }

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

    /// @dev Calculate price of bToken based on Black-Scholes approximation by Brennan-Subrahmanyam from their paper
    /// "A Simple Formula to Compute the Implied Standard Deviation" (1988).
    /// Formula: 0.4 * ImplVol * sqrt(timeUntilExpiry) * priceRatio
    ///
    /// Please note that the 0.4 is assumed to already be factored into the `volatility` argument. We do this to save
    /// gas.
    ///
    /// Returns premium in units of percentage of collateral locked in a contract for both calls and puts
    function calcPrice(
        uint256 timeUntilExpiry,
        uint256 strike,
        uint256 currentPrice,
        uint256 volatility,
        bool isPutOption
    ) public pure returns (uint256) {
        uint256 intrinsic = 0;
        uint256 timeValue = 0;

        if (isPutOption) {
            if (currentPrice < strike) {
                // ITM
                intrinsic = ((strike - currentPrice) * 1e18) / strike;
            }

            timeValue =
                (Math.sqrt(timeUntilExpiry) * volatility * strike) /
                currentPrice;
        } else {
            if (currentPrice > strike) {
                // ITM
                intrinsic = ((currentPrice - strike) * 1e18) / currentPrice;
            }

            // use a Black-Scholes approximation to calculate the option price given the
            // volatility, strike price, and the current series price
            timeValue =
                (Math.sqrt(timeUntilExpiry) * volatility * currentPrice) /
                strike;
        }

        // Verify that 100% is the max that can be returned.
        // A super deep In The Money option could return a higher value than 100% using the approximation formula
        if (intrinsic + timeValue > 1e18) {
            return 1e18;
        }

        return intrinsic + timeValue;
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
        uint256 impliedVolatility
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
                    impliedVolatility
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
        uint256 underlyingPrice = refs.priceOracle.getCurrentPrice(
            refs.seriesController.underlyingToken(seriesId),
            refs.seriesController.priceToken(seriesId)
        );

        return
            getPriceForExpiredSeriesInternal(
                series,
                underlyingPrice,
                volatilityFactor
            );
    }

    function getPriceForExpiredSeriesInternal(
        ISeriesController.Series memory series,
        uint256 underlyingPrice,
        uint256 volatilityFactor
    ) private view returns (uint256) {
        return
            // Note! This function assumes the underlyingPrice is a valid series
            // price in units of underlyingToken/priceToken. If the onchain price
            // oracle's value were to drift from the true series price, then the bToken price
            // we calculate here would also drift, and will result in undefined
            // behavior for any functions which call getPriceForExpiredSeriesInternal
            calcPrice(
                series.expirationDate - block.timestamp,
                series.strikePrice,
                underlyingPrice,
                volatilityFactor,
                series.isPutOption
            );
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
        uint256 impliedVolatility
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
            info.underlyingPrice = refs.priceOracle.getCurrentPrice(
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
                    series,
                    info.underlyingPrice,
                    impliedVolatility
                );
                // wPrice = 1 - bPrice
                uint256 wPrice = uint256(1e18) - bPrice;

                info.activeTokensValue += refs
                    .seriesController
                    .getCollateralPerOptionToken(
                        info.seriesId,
                        (bTokenBalance * bPrice + wTokenBalance * wPrice) / 1e18
                    );
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

    /// @notice Claims any remaining collateral from expired series whose wToken is held by the AMM, and removes
    /// the expired series from the AMM's collection of series
    function claimExpiredTokens(References storage refs, uint64 seriesId)
        public
    {
        // claim the expired series' wTokens, which means it can now be safely removed
        uint256 bTokenIndex = SeriesLibrary.bTokenIndex(seriesId);
        uint256 wTokenIndex = SeriesLibrary.wTokenIndex(seriesId);

        uint256 bTokenBalance = refs.erc1155Controller.balanceOf(
            address(this),
            bTokenIndex
        );
        if (bTokenBalance > 0) {
            refs.seriesController.exerciseOption(
                seriesId,
                bTokenBalance,
                false
            );
        }

        uint256 wTokenBalance = refs.erc1155Controller.balanceOf(
            address(this),
            wTokenIndex
        );
        if (wTokenBalance > 0) {
            refs.seriesController.claimCollateral(seriesId, wTokenBalance);
        }
        // Remove the expired series to free storage and reduce gas fee
        // NOTE: openSeries.remove will remove the series from the i’th position in the EnumerableSet by
        // swapping it with the last element in EnumerableSet and then calling .pop on the internal array.
        // We are relying on this undocumented behavior of EnumerableSet, which is acceptable because once
        // deployed we will never change the EnumerableSet logic.
        // openSeries.remove(seriesId);
    }
}

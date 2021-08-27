pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "./IAmmDataProvider.sol";
import "../token/ISimpleToken.sol";
import "../series/ISeriesController.sol";
import "../series/SeriesLibrary.sol";
import "../libraries/Math.sol";

contract AmmDataProvider is IAmmDataProvider {
    ISeriesController public seriesController;
    IERC1155 public erc1155Controller;

    event AmmDataProviderCreated(
        ISeriesController seriesController,
        IERC1155 erc1155Controller
    );

    constructor(
        ISeriesController _seriesController,
        IERC1155 _erc1155Controller
    ) {
        require(
            address(_seriesController) != address(0x0),
            "AmmDataProvider: _seriesController cannot be the 0x0 address"
        );
        require(
            address(_erc1155Controller) != address(0x0),
            "AmmDataProvider: _erc1155Controller cannot be the 0x0 address"
        );

        seriesController = _seriesController;
        erc1155Controller = _erc1155Controller;

        emit AmmDataProviderCreated(_seriesController, _erc1155Controller);
    }

    /// This function determines reserves of a bonding curve for a specific series.
    /// Given price of bToken we determine what is the largest pool we can create such that
    /// the ratio of its reserves satisfy the given bToken price: Rb / Rw = (1 - Pb) / Pb
    function getVirtualReserves(
        uint64 seriesId,
        address ammAddress,
        uint256 collateralTokenBalance,
        uint256 bTokenPrice
    ) public view override returns (uint256, uint256) {
        uint256 bTokenIndex = SeriesLibrary.bTokenIndex(seriesId);
        uint256 wTokenIndex = SeriesLibrary.wTokenIndex(seriesId);

        // Get residual balances
        uint256 bTokenBalance = erc1155Controller.balanceOf(
            ammAddress,
            bTokenIndex
        );
        uint256 wTokenBalance = erc1155Controller.balanceOf(
            ammAddress,
            wTokenIndex
        );

        ISeriesController.Series memory series = seriesController.series(
            seriesId
        );

        // For put convert token balances into collateral locked in them
        if (series.isPutOption) {
            bTokenBalance = seriesController.getCollateralPerOptionToken(
                seriesId,
                bTokenBalance
            );
            wTokenBalance = seriesController.getCollateralPerOptionToken(
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
    ) external pure override returns (uint256) {
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
        uint64 seriesId,
        address ammAddress,
        uint256 bTokenAmount,
        uint256 collateralTokenBalance,
        uint256 bTokenPrice
    ) external view override returns (uint256) {
        // Shortcut for 0 amount
        if (bTokenAmount == 0) return 0;

        bTokenAmount = seriesController.getCollateralPerOptionToken(
            seriesId,
            bTokenAmount
        );

        // For both puts and calls balances are expressed in collateral token
        (uint256 bTokenBalance, uint256 wTokenBalance) = getVirtualReserves(
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
        uint64 seriesId,
        address ammAddress,
        uint256 optionTokenAmount,
        uint256 collateralTokenBalance,
        uint256 bTokenPrice,
        bool isBToken
    ) external view override returns (uint256) {
        // Shortcut for 0 amount
        if (optionTokenAmount == 0) return 0;

        optionTokenAmount = seriesController.getCollateralPerOptionToken(
            seriesId,
            optionTokenAmount
        );

        (uint256 bTokenBalance, uint256 wTokenBalance) = getVirtualReserves(
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
}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.6.6 <=0.8.0;

/** Interface for any Siren contract which implements the functionality for trading
 * wTokens and bTokens
 */
interface ISirenTradeAMM {
    function bTokenBuy(
        uint64 seriesId,
        uint256 bTokenAmount,
        uint256 collateralMaximum
    ) external returns (uint256);

    function bTokenGetCollateralIn(uint64 seriesId, uint256 bTokenAmount)
        external
        returns (uint256);

    function bTokenGetCollateralOut(uint64 seriesId, uint256 bTokenAmount)
        external
        returns (uint256);

    function bTokenSell(
        uint64 seriesId,
        uint256 bTokenAmount,
        uint256 collateralMinimum
    ) external returns (uint256);

    function wTokenSell(
        uint64 seriesId,
        uint256 wTokenAmount,
        uint256 collateralMinimum
    ) external returns (uint256);

    function wTokenGetCollateralOut(uint64 seriesId, uint256 bTokenAmount)
        external
        returns (uint256);
}

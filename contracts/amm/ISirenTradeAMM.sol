// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.0;

/** Interface for any Siren contract which implements the functionality for trading
 * wTokens and bTokens
 */
interface ISirenTradeAMM {
    function bTokenBuy(uint256 collateralAmount) external;

    function bTokenSell(uint256 collateralAmount) external;

    function wTokenBuy(uint256 collateralAmount) external;

    function wTokenSell(uint256 collateralAmount) external;
}

pragma solidity 0.6.12;

/** Interface for any Siren contract which implements the functionality for trading
 * wTokens and bTokens
 */
interface ISirenTradeAMM {
    function bTokenBuy(uint256 collateralAmount) external;

    function bTokenSell(uint256 collateralAmount) external;

    function wTokenBuy(uint256 collateralAmount) external;

    function wTokenSell(uint256 collateralAmount) external;
}

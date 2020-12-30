// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "../token/ISimpleToken.sol";

/** Interface for any Siren Market
 */
interface IMarket {
    /** Tracking the different states of the market */
    enum MarketState {
        /**
         * New options can be created
         * Redemption token holders can redeem their options for collateral
         * Collateral token holders can't do anything
         */
        OPEN,
        /**
         * No new options can be created
         * Redemption token holders can't do anything
         * Collateral tokens holders can re-claim their collateral
         */
        EXPIRED,
        /**
         * 180 Days after the market has expired, it will be set to a closed state.
         * Once it is closed, the owner can sweep any remaining tokens and destroy the contract
         * No new options can be created
         * Redemption token holders can't do anything
         * Collateral tokens holders can't do anything
         */
        CLOSED
    }

    /** Specifies the manner in which options can be redeemed */
    enum MarketStyle {
        /**
         * Options can only be redeemed 30 minutes prior to the option's expiration date
         */
        EUROPEAN_STYLE,
        /**
         * Options can be redeemed any time between option creation
         * and the option's expiration date
         */
        AMERICAN_STYLE
    }

    function state() external view returns (MarketState);

    function mintOptions(uint256 collateralAmount) external;

    function calculatePaymentAmount(uint256 collateralAmount)
        external
        view
        returns (uint256);

    function calculateFee(uint256 amount, uint16 basisPoints)
        external
        pure
        returns (uint256);

    function exerciseOption(uint256 collateralAmount) external;

    function claimCollateral(uint256 collateralAmount) external;

    function closePosition(uint256 collateralAmount) external;

    function recoverTokens(IERC20 token) external;

    function selfDestructMarket(address payable refundAddress) external;

    function updateRestrictedMinter(address _restrictedMinter) external;

    function marketName() external view returns (string memory);

    function priceRatio() external view returns (uint256);

    function expirationDate() external view returns (uint256);

    function collateralToken() external view returns (IERC20);

    function paymentToken() external view returns (IERC20);

    function wToken() external view returns (ISimpleToken);

    function bToken() external view returns (ISimpleToken);

    function updateImplementation(address newImplementation) external;

    function initialize(
        string calldata _marketName,
        address _collateralToken,
        address _paymentToken,
        MarketStyle _marketStyle,
        uint256 _priceRatio,
        uint256 _expirationDate,
        uint16 _exerciseFeeBasisPoints,
        uint16 _closeFeeBasisPoints,
        uint16 _claimFeeBasisPoints,
        address _tokenImplementation
    ) external;
}

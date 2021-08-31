// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../series/ISeriesController.sol";

interface InitializeableAmm {
    function initialize(
        ISeriesController _seriesController,
        address _priceOracle,
        address _ammDataProvider,
        IERC20 _underlyingToken,
        IERC20 _priceToken,
        IERC20 _collateralToken,
        address _tokenImplementation,
        uint16 _tradeFeeBasisPoints
    ) external;
}

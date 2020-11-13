pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "../market/IMarketsRegistry.sol";

interface InitializeableAmm {
    function initialize(
        IMarketsRegistry _registry,
        AggregatorV3Interface _priceOracle,
        IERC20 _paymentToken,
        IERC20 _collateralToken,
        address _tokenImplementation,
        uint16 _tradeFeeBasisPoints,
        bool _shouldInvertOraclePrice
    ) external;

    function transferOwnership(address newOwner) external;
}

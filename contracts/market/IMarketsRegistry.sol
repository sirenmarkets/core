pragma solidity 0.6.12;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "./IMarket.sol";

/** Interface for any Siren MarketsRegistry
 */
interface IMarketsRegistry {
    // function state() external view returns (MarketState);

    function markets(string calldata marketName)
        external
        view
        returns (address);

    function getMarketsByAssetPair(bytes32 assetPair)
        external
        view
        returns (address[] memory);

    function amms(bytes32 assetPair) external view returns (address);

    function initialize(
        address _tokenImplementation,
        address _marketImplementation,
        address _ammImplementation
    ) external;

    function updateTokenImplementation(address newTokenImplementation) external;

    function updateMarketImplementation(address newMarketImplementation)
        external;

    function updateAmmImplementation(address newAmmImplementation) external;

    function updateMarketsRegistryImplementation(
        address newMarketsRegistryImplementation
    ) external;

    function createMarket(
        string calldata _marketName,
        address _collateralToken,
        address _paymentToken,
        IMarket.MarketStyle _marketStyle,
        uint256 _priceRatio,
        uint256 _expirationDate,
        uint16 _exerciseFeeBasisPoints,
        uint16 _closeFeeBasisPoints,
        uint16 _claimFeeBasisPoints,
        address _amm
    ) external returns (address);

    function createAmm(
        AggregatorV3Interface _priceOracle,
        IERC20 _paymentToken,
        IERC20 _collateralToken,
        uint16 _tradeFeeBasisPoints,
        bool _shouldInvertOraclePrice
    ) external returns (address);

    function selfDestructMarket(IMarket market, address payable refundAddress)
        external;

    function updateImplementationForMarket(
        IMarket market,
        address newMarketImplementation
    ) external;

    function recoverTokens(IERC20 token, address destination) external;
}

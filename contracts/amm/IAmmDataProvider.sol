pragma solidity 0.8.0;

interface IAmmDataProvider {
    function getVirtualReserves(
        uint64 seriesId,
        address ammAddress,
        uint256 collateralTokenBalance,
        uint256 bTokenPrice
    ) external view returns (uint256, uint256);

    function calcPrice(
        uint256 timeUntilExpiry,
        uint256 strike,
        uint256 currentPrice,
        uint256 volatility,
        bool isPutOption
    ) external pure returns (uint256);

    function bTokenGetCollateralIn(
        uint64 seriesId,
        address ammAddress,
        uint256 bTokenAmount,
        uint256 collateralTokenBalance,
        uint256 bTokenPrice
    ) external view returns (uint256);

    function optionTokenGetCollateralOut(
        uint64 seriesId,
        address ammAddress,
        uint256 optionTokenAmount,
        uint256 collateralTokenBalance,
        uint256 bTokenPrice,
        bool isBToken
    ) external view returns (uint256);
}

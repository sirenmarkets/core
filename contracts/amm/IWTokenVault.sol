pragma solidity 0.8.0;

interface IWTokenVault {
    function getWTokenBalance(address poolAddress, uint64 seriesId)
        external
        returns (uint256);

    function lockActiveWTokens(
        uint256 lpTokenAmount,
        uint256 lpTokenSupply,
        address redeemer,
        uint256 volatility
    ) external;

    function redeemCollateral(uint64 expirationId, address redeemer)
        external
        returns (uint256);

    function addCollateral(
        uint64 expirationId,
        uint256 collateralAmount,
        uint256 wTokenAmount
    ) external;
}

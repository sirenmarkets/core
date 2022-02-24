pragma solidity 0.8.0;

interface IWTokenVault {
    event WTokensLocked(
        address ammAddress,
        address redeemer,
        uint256 expirationDate,
        uint256 wTokenAmount,
        uint256 lpSharesMinted
    );
    event LpSharesRedeemed(
        address ammAddress,
        address redeemer,
        uint256 expirationDate,
        uint256 numShares,
        uint256 collateralAmount
    );
    event CollateralLocked(
        address ammAddress,
        uint256 expirationDate,
        uint256 collateralAmount,
        uint256 wTokenAmount
    );

    function getWTokenBalance(address poolAddress, uint64 seriesId)
        external
        view
        returns (uint256);

    function lockActiveWTokens(
        uint256 lpTokenAmount,
        uint256 lpTokenSupply,
        address redeemer,
        uint256 volatility
    ) external;

    function redeemCollateral(uint256 expirationDate, address redeemer)
        external
        returns (uint256);

    function lockCollateral(
        uint64 seriesId,
        uint256 collateralAmount,
        uint256 wTokenAmount
    ) external;

    function getLockedValue(address _ammAddress, uint256 _expirationDate)
        external
        view
        returns (uint256);

    function getRedeemableCollateral(
        address _ammAddress,
        uint256 _expirationDate
    ) external returns (uint256);
}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.0;

interface IVolatilityOracle {
    function vol(address underlyingToken, address priceToken)
        external
        view
        returns (uint256 standardDeviation);

    function annualizedVol(address underlyingToken, address priceToken)
        external
        view
        returns (uint256 annualStdev);
}

// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IAddMarketToAmm {
    function addMarket(address newMarketAddress,address sender) external;
}
